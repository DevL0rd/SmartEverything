import { rm } from 'node:fs/promises';
import {
  ApiError,
  pluginPowers,
  type JsonValue,
  type InboundMessage,
  type PluginDataPoint,
  type PluginInstall,
  type PluginLogLine,
  type PluginRow,
  type PluginSaved,
  type PluginToolOutcome,
  type PluginToolRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { needsConfirmation } from '../ai-tools/confirmation';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type { PluginConfiguration } from './builtin/contract';
import type { PluginHost, RunningTool } from './host';
import type { PluginInbox } from './inbound';
import { findManifest } from './manifest-source';
import { applyChange, type PluginChangeInput } from './plugin-change';
import type { PluginSecrets } from './plugin-secrets';
import { pluginHubTool } from './plugin-tools';

export interface PluginAdminOptions {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly host: () => PluginHost;
  readonly inbox: () => PluginInbox;
  readonly validate: (
    row: PluginRow,
    settings: Readonly<Record<string, JsonValue>>,
  ) => string | null;
  readonly fetch: typeof fetch;
}

export interface ToolCall {
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly confirm: boolean;
}

const FAILED = z.looseObject({ error: z.string() });

export class PluginAdmin {
  constructor(private readonly options: PluginAdminOptions) {}

  list(): PluginRow[] {
    return this.options.store.plugins.list();
  }

  async install(install: PluginInstall): Promise<PluginRow> {
    const found = await findManifest(install, this.options.fetch);
    if (this.options.store.plugins.find(found.manifest.id) !== undefined) {
      throw new ApiError('conflict', `${found.manifest.name} is already added.`);
    }
    return this.options.store.plugins.create({
      manifest: found.manifest,
      source: install.source,
      location: found.location,
      trusted: false,
    });
  }

  async update(id: string, change: PluginChangeInput): Promise<PluginSaved> {
    const row = this.options.store.plugins.byId(id);
    const powers = pluginPowers(row.manifest);
    if (change.enabled === true && !row.enabled && powers.length > 0 && !change.confirm) {
      return {
        outcome: 'needs_confirmation',
        reason: `Switching on ${row.manifest.name} lets it do more than offer tools.`,
        powers,
      };
    }
    const applied = await applyChange(row, change, this.options);
    await this.restartIf(applied.restart, applied.row);
    this.options.host().changed();
    return { outcome: 'saved', plugin: this.options.store.plugins.byId(id) };
  }

  async configure(id: string, change: Partial<PluginConfiguration>): Promise<void> {
    const row = this.options.store.plugins.byId(id);
    const applied = await applyChange(
      row,
      { settings: change.settings ?? {}, secrets: change.secrets ?? {}, confirm: false },
      this.options,
    );
    setImmediate(() => {
      this.restartIf(applied.restart, applied.row).catch((cause: unknown) => {
        this.options.host().slot(id)?.logs.add(String(cause), new Date());
      });
    });
  }

  async restart(id: string): Promise<PluginRow> {
    const row = this.options.store.plugins.byId(id);
    if (!row.enabled) {
      throw new ApiError('conflict', `${row.manifest.name} is switched off.`);
    }
    await this.options.host().launch(id);
    return this.options.store.plugins.byId(id);
  }

  async remove(id: string): Promise<void> {
    const row = this.options.store.plugins.byId(id);
    if (row.source === 'builtin') {
      throw new ApiError('conflict', `${row.manifest.name} is built in; switch it off instead.`);
    }
    const host = this.options.host();
    await host.halt(id);
    await this.options.secrets.forget(id);
    this.options.store.plugins.remove(id);
    await rm(host.dataOf(id), { recursive: true, force: true });
    host.changed();
  }

  tools(id: string): PluginToolRow[] {
    const row = this.options.store.plugins.byId(id);
    return (this.options.host().slot(id)?.tools() ?? []).map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      read_only: tool.annotations.readOnlyHint,
      destructive: tool.annotations.destructiveHint,
      human_only: tool.humanOnly,
      enabled: row.tool_switches[tool.name] ?? true,
    }));
  }

  log(id: string): readonly PluginLogLine[] {
    this.options.store.plugins.byId(id);
    return this.options.host().slot(id)?.logs.read() ?? [];
  }

  data(id: string, stream: string | undefined, limit: number): PluginDataPoint[] {
    this.options.store.plugins.byId(id);
    return stream === undefined
      ? this.options.store.pluginData.latest(id)
      : this.options.store.pluginData.history(id, stream, limit);
  }

  async callTool(
    id: string,
    name: string,
    call: ToolCall,
    caller: ToolCaller,
  ): Promise<PluginToolOutcome> {
    const found = this.runningTool(id, name);
    if (found.tool.humanOnly && caller.role !== 'owner') {
      throw new ApiError('forbidden', `Only an owner can run ${found.tool.title}.`);
    }
    const hubTool = { ...pluginHubTool(found.plugin, found.tool), humanOnly: false };
    if (!call.confirm && needsConfirmation(hubTool, call.arguments)) {
      return { outcome: 'needs_confirmation', reason: hubTool.title };
    }
    const result = await this.options
      .host()
      .call(id, name, call.arguments, { ...caller, confirmed: true });
    const failed = FAILED.safeParse(result.response);
    if (failed.success) {
      throw new ApiError('upstream_failed', failed.data.error);
    }
    return { outcome: 'done', result: result.response };
  }

  post(pluginId: string, message: InboundMessage): void {
    const row = this.options.store.plugins.byId(pluginId);
    if (!row.enabled || !row.manifest.permissions.inbound) {
      throw new ApiError('forbidden', `${row.manifest.name} may not post into chats.`);
    }
    this.options.inbox().receive(pluginId, message);
  }

  private runningTool(id: string, name: string): RunningTool {
    const row = this.options.store.plugins.byId(id);
    const found = this.options
      .host()
      .running()
      .find((entry) => entry.plugin.id === id && entry.tool.name === name);
    if (found === undefined) {
      throw new ApiError(
        'not_found',
        `${row.manifest.name} has no tool named ${name}, or it is off.`,
      );
    }
    return found;
  }

  private async restartIf(restart: boolean, row: PluginRow): Promise<void> {
    if (!restart) {
      return;
    }
    const host = this.options.host();
    await (row.enabled ? host.launch(row.id) : host.halt(row.id));
  }
}
