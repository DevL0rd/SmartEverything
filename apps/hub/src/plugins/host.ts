import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  MCP_PATHS,
  PLUGIN_MANIFEST,
  type JsonValue,
  type PluginRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { failure, type HubToolResult, type ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type { BuiltinPlugin, PluginConfiguration } from './builtin/contract';
import type { BuiltinContextOptions } from './builtin-context';
import { BuiltinRuntime } from './builtin-runtime';
import { connectionFor, type Connection } from './connection';
import { contributionsOf, type ContributionOptions, type Contributions } from './contributions';
import { McpRuntime } from './mcp-runtime';
import type { PluginSecrets } from './plugin-secrets';
import { PluginSlot } from './plugin-slot';
import { callbackFor } from './plugin-tokens';
import type { PluginRuntime, RuntimeSinks, RuntimeTool } from './runtime';

export interface PluginHostOptions {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly builtins: readonly BuiltinPlugin[];
  readonly builtin: Omit<BuiltinContextOptions, 'configure' | 'secrets' | 'store' | 'log'>;
  readonly contributions: Omit<ContributionOptions, 'store'>;
  readonly configure: (pluginId: string, change: Partial<PluginConfiguration>) => Promise<void>;
  readonly dataDirectory: string;
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

  constructor(private readonly options: PluginHostOptions) {}

  async boot(): Promise<void> {
    this.syncBuiltins();
    const enabled = this.options.store.plugins.list().filter((row) => row.enabled);
    await Promise.all(enabled.map((row) => this.launch(row.id)));
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.slots.keys()].map((id) => this.halt(id)));
  }

  async launch(id: string): Promise<void> {
    await this.halt(id);
    const row = this.options.store.plugins.byId(id);
    const data = this.dataOf(id);
    await mkdir(data, { recursive: true, mode: 0o700 });
    const slot = new PluginSlot({
      factory: (sinks): PluginRuntime =>
        this.runtimeOf(this.options.store.plugins.byId(id), data, sinks),
      contributions: (log): Contributions =>
        contributionsOf(
          { ...this.options.contributions, store: this.options.store },
          row.manifest,
          log,
        ),
      status: (status, detail): void => {
        this.options.store.plugins.update(id, { status, statusDetail: detail });
        this.options.log.info('plugin.status', { plugin: id, status });
      },
      toolsChanged: (): void => {
        this.changed();
      },
      now: this.options.now,
    });
    this.slots.set(id, slot);
    await slot.start();
  }

  async halt(id: string): Promise<void> {
    const slot = this.slots.get(id);
    this.slots.delete(id);
    await slot?.stop();
    this.options.store.plugins.dropToken(id);
    const row = this.options.store.plugins.find(id);
    if (row !== undefined && !row.enabled && row.status !== 'disabled') {
      this.options.store.plugins.update(id, { status: 'disabled', statusDetail: null });
    }
  }

  dataOf(id: string): string {
    return join(this.options.dataDirectory, 'plugins', id);
  }

  slot(id: string): PluginSlot | undefined {
    return this.slots.get(id);
  }

  running(): RunningTool[] {
    return [...this.slots.entries()].flatMap(([id, slot]) => {
      const plugin = this.options.store.plugins.find(id);
      if (plugin === undefined) {
        return [];
      }
      return slot
        .tools()
        .filter((tool) => plugin.tool_switches[tool.name] ?? true)
        .map((tool) => ({ plugin, tool }));
    });
  }

  call(
    pluginId: string,
    tool: string,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    const slot = this.slots.get(pluginId);
    return slot === undefined
      ? Promise.resolve(failure('That plugin is switched off'))
      : slot.call(tool, args, caller);
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

  private syncBuiltins(): void {
    for (const plugin of this.options.builtins) {
      const manifest = PLUGIN_MANIFEST.parse(plugin.manifest);
      if (this.options.store.plugins.find(manifest.id) === undefined) {
        this.options.store.plugins.create({
          manifest,
          source: 'builtin',
          location: null,
          trusted: true,
        });
      } else {
        this.options.store.plugins.update(manifest.id, { manifest });
      }
    }
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
    return new McpRuntime(row.manifest, () => this.connect(row, data), sinks);
  }

  private connect(row: PluginRow, data: string): Connection {
    const connection = connectionFor(row.manifest, {
      row,
      values: { home: homedir(), data, secret: (name) => this.options.secrets.get(row.id, name) },
      callback: callbackFor(this.options.store, row, `${this.options.mcpUrl()}${MCP_PATHS.mcp}`),
    });
    if (connection === null) {
      throw new Error(`${row.manifest.name} has no MCP server to start`);
    }
    return connection;
  }
}
