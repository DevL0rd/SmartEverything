import { localPluginTransport } from './local-transport';
import { currentExecutionAuthority, hubOriginated } from '../assistant/turn-authority';
import { resetPluginCallAuthority, withPluginCallAuthority } from './call-authority';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  ApiError,
  MCP_PATHS,
  PLUGIN_MANIFEST,
  type JsonValue,
  type PluginRow,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { failure, type HubToolResult, type ToolCaller } from '../ai-tools/hub-tool';
import type { HubLayout } from '../data-layout';
import type { Store } from '../store/store';
import type { BuiltinPlugin, PluginConfiguration } from './builtin/contract';
import type { BuiltinContextOptions } from './builtin-context';
import { BuiltinRuntime } from './builtin-runtime';
import { connectionFor, type Connection } from './connection';
import { contributionsOf, type ContributionOptions, type Contributions } from './contributions';
import { McpRuntime } from './mcp-runtime';
import type { PluginSecrets } from './plugin-secrets';
import { PluginSlot } from './plugin-slot';
import { pluginLogger } from './plugin-logs';
import { callbackFor } from './plugin-tokens';
import type { PluginRuntime, RuntimeSinks, RuntimeTool } from './runtime';

export interface PluginHostOptions {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly builtins: readonly BuiltinPlugin[];
  readonly builtin: Omit<BuiltinContextOptions, 'configure' | 'secrets' | 'store' | 'log'>;
  readonly contributions: Omit<ContributionOptions, 'store'>;
  readonly configure: (
    pluginId: string,
    change: Partial<PluginConfiguration>,
    by?: ToolCaller,
  ) => Promise<void>;
  readonly layout: HubLayout;
  readonly mcpUrl: () => string;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface RunningTool {
  readonly plugin: PluginRow;
  readonly tool: RuntimeTool;
}

export class PluginHost {
  private readonly slots = new Map<string, PluginSlot>();
  private readonly listeners = new Set<() => void>();
  private readonly rows = new Map<string, PluginRow>();

  constructor(private readonly options: PluginHostOptions) {
    options.store.feed.subscribe((change) => {
      if (change.table !== 'plugins') return;
      const id = (change.record ?? change.oldRecord)?.id;
      if (id === undefined || !this.rows.has(id)) return;
      if (change.record === null) this.rows.delete(id);
      else this.rows.set(id, change.record);
    });
  }

  async boot(): Promise<void> {
    await this.syncBuiltins();
    const enabled = (await this.options.store.host.call('plugins', 'list')).filter(
      (row) => row.enabled,
    );
    await Promise.all(enabled.map((row) => this.launch(row.id)));
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.slots.keys()].map((id) => this.halt(id)));
  }

  async launch(id: string): Promise<void> {
    await this.halt(id);
    const row = await this.options.store.host.call('plugins', 'byId', id);
    this.rows.set(id, row);
    const data = this.dataOf(id);
    await mkdir(data, { recursive: true, mode: 0o700 });
    const log = pluginLogger(this.options.log, id);
    const slot = new PluginSlot({
      id,
      log,
      factory: (sinks): PluginRuntime => this.runtimeOf(this.current(id), data, sinks),
      contributions: (log): Contributions =>
        contributionsOf(
          { ...this.options.contributions, store: this.options.store },
          row.manifest,
          log,
        ),
      status: (status, detail): void => {
        background(
          this.options.store.host.call('plugins', 'update', id, { status, statusDetail: detail }),
          'plugin.status_save_failed',
          { plugin: id },
        );
        log.info('plugin.status', {
          plugin: id,
          status,
          ...(detail === null ? {} : { detail }),
        });
      },
      toolsChanged: (): void => {
        this.changed();
      },
      now: this.options.now,
    });
    this.slots.set(id, slot);
    await slot.start();
    await this.options.store.host.call('plugins', 'byId', id);
    this.changed();
  }

  async halt(id: string): Promise<void> {
    const slot = this.slots.get(id);
    this.slots.delete(id);
    await slot?.stop();
    this.rows.delete(id);
    const { host } = this.options.store;
    await host.call('plugins', 'dropToken', id);
    resetPluginCallAuthority(this.options.store, id);
    const row = await host.call('plugins', 'find', id);
    if (row !== undefined && !row.enabled && row.status !== 'disabled') {
      await host.call('plugins', 'update', id, { status: 'disabled', statusDetail: null });
    }
  }

  dataOf(id: string): string {
    return this.options.layout.system.plugins(id);
  }

  applyLive(id: string, settings: Readonly<Record<string, JsonValue>>): void {
    this.slots.get(id)?.settingsChanged(settings);
  }

  slot(id: string): PluginSlot | undefined {
    return this.slots.get(id);
  }

  running(): RunningTool[] {
    return [...this.slots.entries()].flatMap(([id, slot]) => {
      const plugin = this.rows.get(id);
      if (plugin === undefined) {
        return [];
      }
      return slot
        .tools()
        .filter((tool) => plugin.tool_switches[tool.name] ?? true)
        .map((tool) => ({ plugin, tool }));
    });
  }

  async call(
    pluginId: string,
    tool: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    const slot = this.slots.get(pluginId);
    if (slot === undefined) return failure('That plugin is switched off');
    const authority = caller.authority ?? currentExecutionAuthority();
    if (authority === undefined) return slot.call(tool, args, caller);
    const plugin = await this.options.store.host.call('plugins', 'byId', pluginId);
    if (
      hubOriginated(authority) &&
      plugin.source !== 'builtin' &&
      localPluginTransport(plugin.manifest.mcp, this.options.mcpUrl())
    )
      throw new ApiError(
        'forbidden',
        'Hub conversations cannot invoke an external local process whose OS effects cannot enforce the initiating restriction.',
      );
    return withPluginCallAuthority(this.options.store, pluginId, authority, () =>
      slot.call(tool, args, caller),
    );
  }

  validate(row: PluginRow, settings: Readonly<Record<string, JsonValue>>): string | null {
    const builtin = row.source === 'builtin' ? this.builtinOf(row.id) : undefined;
    return builtin === undefined ? null : builtin.validate(settings);
  }

  changes(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  changed(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private async syncBuiltins(): Promise<void> {
    await this.options.store.host.write(
      'pluginBuiltinsSync',
      this.options.builtins.map((plugin) => PLUGIN_MANIFEST.parse(plugin.manifest)),
    );
  }

  private current(id: string): PluginRow {
    const row = this.rows.get(id);
    if (row === undefined) throw new ApiError('not_found', `The plugin ${id} is not launched.`);
    return row;
  }

  private builtinOf(id: string): BuiltinPlugin | undefined {
    return this.options.builtins.find((plugin) => PLUGIN_MANIFEST.parse(plugin.manifest).id === id);
  }

  private runtimeOf(row: PluginRow, data: string, sinks: RuntimeSinks): PluginRuntime {
    const builtin = row.source === 'builtin' ? this.builtinOf(row.id) : undefined;
    if (builtin !== undefined) {
      return new BuiltinRuntime({
        plugin: builtin,
        settings: row.settings,
        sinks,
        context: {
          ...this.options.builtin,
          store: this.options.store,
          secrets: this.options.secrets,
          configure: this.options.configure,
          log: this.options.log,
        },
      });
    }
    return new McpRuntime(
      row.manifest,
      () => this.connect(row, data),
      sinks,
      (tool, args, caller) => this.call(row.id, tool, args, caller),
    );
  }

  private async connect(row: PluginRow, data: string): Promise<Connection> {
    const connection = connectionFor(row.manifest, {
      row,
      values: { home: homedir(), data, secret: (name) => this.options.secrets.get(row.id, name) },
      callback: await callbackFor(
        this.options.store,
        row,
        `${this.options.mcpUrl()}${MCP_PATHS.mcp}`,
      ),
    });
    if (connection === null) {
      throw new Error(`${row.manifest.name} has no MCP server to start`);
    }
    return connection;
  }
}
