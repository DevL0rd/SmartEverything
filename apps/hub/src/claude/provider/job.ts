import { assertManagedControl, assertManagedCommand, managedContext } from './managed-project';
import { nativeSourcesEnabled } from './agent-scope';
import { permitsProviderTool } from './tool-scope';
import { ProviderSource } from './source';
import { ProviderCommandCatalogue } from './command-catalogue';
import {
  commandMessage,
  commandRevision,
  commandSource,
  commandResultText,
  rememberPending,
} from './command-input';
import { requireSubscription, turnScope, serializableServerResult } from './job-state';
import { requireNativeSubscriptionBilling } from './billing';
export { requireSubscription } from './job-state';
import { z } from 'zod';
import { readTaskOutput } from './task-output';
import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type HookJSONOutput,
  type HookInput,
} from '@anthropic-ai/claude-agent-sdk';
import {
  PROVIDER_EVENT,
  JSON_VALUE,
  type ProviderEvent,
  type ProviderTurn,
  type ProviderAnswer,
  type JsonValue,
  CLAUDE_MCP_SERVERS,
  type ClaudeMcpServers,
  type ProviderControl,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ProviderInput, ProviderInputError, userMessageOf } from './input';
import { jobOptions } from './job-options';
import { flagSettings } from './settings';
import { modelOptions } from './options';
import { ProviderDialogs } from './dialogs';
import { ProviderPrompts } from './prompts';
import { ProviderTools, type ProviderToolResult } from './tools';
import { controlledTurn } from './turn-controls';
import {
  serializableMessage,
  carriesToolResult,
  messageEvents,
  resultEvents,
  type ProviderPayload,
} from './events';
export interface ProviderJobOptions {
  readonly turn: ProviderTurn;
  readonly cwd: string;
  readonly executable?: string;
  readonly log: Logger;
  readonly publish: (event: ProviderEvent) => void;
}
export class ProviderJob {
  readonly query: Query;
  readonly abort = new AbortController();
  private readonly input = new ProviderInput();
  private readonly tools: ProviderTools;
  private readonly prompts: ProviderPrompts;
  private readonly dialogs: ProviderDialogs;
  private seq = 0;
  private readonly waiting = new Set<string>();
  readonly source = new ProviderSource();
  readonly commands = new ProviderCommandCatalogue();
  private nativeCommand = false;
  private textObserved = false;
  private sessionId: string;
  private interrupted = false;
  private closed = false;
  private running = true;
  private externalServers: ClaudeMcpServers;
  private readonly blockedServerNames = new Set<string>();
  private readonly nativeServerNames = new Set<string>();
  private readonly builtinNames = new Set<string>();
  private initialization: Record<string, JsonValue> = {};
  private taskSnapshot: JsonValue = [];
  private readonly taskFiles = new Map<string, string>();
  constructor(public options: ProviderJobOptions) {
    this.externalServers =
      options.turn.managed_project === undefined ? (options.turn.options.mcp_servers ?? {}) : {};
    this.sessionId = options.turn.session_id ?? options.turn.job_id;
    this.dialogs = new ProviderDialogs((payload): void => {
      this.emit(payload);
    });
    this.prompts = new ProviderPrompts(options.log, (prompt): void => {
      this.emit({ kind: 'prompt', prompt });
    });
    this.tools = new ProviderTools(options.turn.tools, this.abort.signal, (call): void => {
      this.emit({ kind: 'tool_call', ...call });
    });
    this.query = query({ prompt: this.input, options: this.sdkOptions() });
  }
  async start(): Promise<void> {
    const initialized = await this.query.initializationResult();
    requireSubscription(initialized.account);
    const model = initialized.models.find(
      (entry) =>
        entry.value === this.options.turn.model || entry.resolvedModel === this.options.turn.model,
    );
    if (model === undefined) {
      throw new ProviderInputError('The requested model is not available on this computer.');
    }
    const chosen = modelOptions(this.options.turn, model);
    if (chosen.effort !== undefined) {
      await this.query.applyFlagSettings({ effortLevel: chosen.effort });
    }
    await this.query.applyFlagSettings(flagSettings(this.options.turn.options.flag_settings ?? {}));
    await this.refreshMcpServers();
    await this.commands.refresh(this.query);
    await requireNativeSubscriptionBilling(this.query);
    this.input.push(userMessageOf(this.options.turn));
    await this.consume();
  }
  async continue(turn: ProviderTurn): Promise<void> {
    if (this.active || this.closed)
      throw new ProviderInputError(
        'The provider session must be idle and open before another turn.',
      );
    const previous = this.options.turn;
    if (turnScope(previous) !== turnScope(turn))
      throw new ProviderInputError(
        'Close this provider job before changing its tools, system prompt, or runtime options; the open session owns its background tasks.',
      );
    const message = userMessageOf(turn);
    const model = (await this.query.supportedModels()).find(
      (entry) => entry.value === turn.model || entry.resolvedModel === turn.model,
    );
    if (model === undefined)
      throw new ProviderInputError('The requested model is not available on this computer.');
    const chosen = modelOptions(turn, model);
    await this.query.setModel(turn.model);
    await this.query.applyFlagSettings({ effortLevel: chosen.effort ?? null });
    await this.query.applyFlagSettings(flagSettings(turn.options.flag_settings ?? {}));
    await this.refreshMcpServers();
    this.options = { ...this.options, turn };
    this.seq = 0;
    this.interrupted = false;
    this.running = true;
    this.nativeCommand = false;
    this.textObserved = false;
    await requireNativeSubscriptionBilling(this.query);
    this.input.push(message);
  }
  get commandRevision(): string {
    return commandRevision(this.commands.revision, this.options.turn);
  }
  async command(jobId: string, name: string, argumentsText: string): Promise<void> {
    if (this.active || this.closed)
      throw new ProviderInputError(
        'The owned Claude Query must remain idle and open before a native command.',
      );
    assertManagedCommand(this.options.turn);
    await requireNativeSubscriptionBilling(this.query);
    this.options = {
      ...this.options,
      turn: { ...this.options.turn, job_id: jobId, session_id: this.sessionId },
    };
    this.seq = 0;
    this.interrupted = false;
    this.running = true;
    this.nativeCommand = true;
    this.textObserved = false;
    this.emit({ kind: 'accepted', session_id: this.sessionId });
    this.input.push(commandMessage(this.options.turn, name, argumentsText));
  }
  metadata(): Record<string, JsonValue> {
    return this.initialization;
  }
  get inputReady(): boolean {
    return this.waiting.size === 0;
  }
  get open(): boolean {
    return !this.closed;
  }
  get active(): boolean {
    return this.running && !this.closed;
  }
  get session(): string {
    return this.sessionId;
  }
  async setMcpServers(raw: ClaudeMcpServers): Promise<JsonValue> {
    assertManagedControl(this.options.turn, { action: 'set_mcp_servers', servers: raw });
    const servers = CLAUDE_MCP_SERVERS.parse(raw);
    const result = await this.query.setMcpServers({ ...servers, home: this.tools.server });
    this.externalServers = servers;
    this.rememberControl({ action: 'set_mcp_servers', servers });
    return serializableServerResult(result);
  }
  rememberControl(control: ProviderControl): void {
    this.options = { ...this.options, turn: controlledTurn(this.options.turn, control) };
    this.emit({
      kind: 'runtime',
      type: 'provider_control',
      payload: this.source.record(
        commandSource(
          { type: 'provider_control', session_id: this.sessionId, action: control.action },
          this.options.turn,
          this.commands,
        ),
        this.options.cwd,
      ),
    });
  }
  tasks(): JsonValue {
    return this.taskSnapshot;
  }
  async taskOutput(id: string): Promise<JsonValue> {
    const file = this.taskFiles.get(id);
    if (file === undefined) {
      throw new ProviderInputError('The SDK did not publish an output file for this owned task.');
    }
    return readTaskOutput(file, id);
  }
  toolResult(id: string, result: ProviderToolResult): boolean {
    return this.tools.answer(id, result);
  }
  answer(id: string, answer: ProviderAnswer): boolean {
    return this.dialogs.answer(id, answer) || this.prompts.answer(id, answer);
  }
  async interrupt(): Promise<boolean> {
    if (!this.running || this.closed) {
      return false;
    }
    this.interrupted = true;
    await this.query.interrupt();
    this.prompts.stop();
    this.dialogs.stop();
    this.tools.stop();
    return true;
  }
  stop(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.input.close();
    this.prompts.stop();
    this.dialogs.stop();
    this.tools.stop();
    this.query.close();
    this.abort.abort();
  }
  fail(cause: unknown): void {
    this.emit({
      kind: 'failed',
      code: 'provider_failed',
      message:
        cause instanceof Error ? cause.message.slice(0, 2000) : 'The local Claude runtime failed.',
    });
    this.stop();
  }
  private emit(payload: ProviderPayload): void {
    rememberPending(this.waiting, payload);
    this.seq += 1;
    this.options.publish(
      PROVIDER_EVENT.parse({
        ...payload,
        seq: this.seq,
        job_id: this.options.turn.job_id,
        chat_id: this.options.turn.chat_id,
      }),
    );
  }
  private async consume(): Promise<void> {
    for await (const message of this.query) {
      if (this.closed) {
        return;
      }
      this.observeMessage(message);
      const events =
        message.type === 'result'
          ? resultEvents(message, this.interrupted)
          : messageEvents(message);
      for (const event of events) {
        if (event.kind === 'text') this.textObserved = true;
        this.emit(event);
      }
      if (message.type === 'result') {
        this.running = false;
      }
    }
    if (this.running && !this.closed) {
      throw new ProviderInputError('The local Claude process closed without a turn result.');
    }
    this.stop();
  }

  private observeMessage(message: SDKMessage): void {
    if (
      this.nativeCommand &&
      message.session_id !== undefined &&
      message.session_id !== this.sessionId
    ) {
      throw new ProviderInputError(
        'A native command returned a different session; shared ownership was not rebound.',
      );
    }
    if (message.session_id !== undefined) {
      this.sessionId = message.session_id;
    }
    this.commands.capture(message);
    this.captureRuntime(message);
    if (this.nativeCommand && !this.textObserved) {
      const text = commandResultText(message);
      if (text !== '') this.emit({ kind: 'text', delta: text });
    }
  }
  private captureRuntime(message: SDKMessage): void {
    if (message.type === 'auth_status') return;
    if (!carriesToolResult(message)) return;
    const payload = serializableMessage(message);
    this.captureTask(message, payload);
    if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = z.record(z.string(), JSON_VALUE).parse(payload);
      if (message.type === 'system' && message.subtype === 'init')
        this.captureInitialization(message, record);
      this.emit({
        kind: 'runtime',
        type: message.type,
        payload: this.source.record(
          commandSource(
            { ...record, ...managedContext(this.options.turn) },
            this.options.turn,
            this.commands,
          ),
          this.options.cwd,
        ),
      });
    }
  }

  private captureInitialization(
    message: Extract<SDKMessage, { type: 'system'; subtype: 'init' }>,
    record: Record<string, JsonValue>,
  ): void {
    this.initialization = { ...record, ...managedContext(this.options.turn) };
    for (const tool of message.tools) if (!tool.startsWith('mcp__')) this.builtinNames.add(tool);
  }

  private async refreshMcpServers(): Promise<void> {
    const native = nativeSourcesEnabled(this.options.turn);
    for (const server of await this.query.mcpServerStatus()) {
      if (server.name === 'home') continue;
      if (server.serverInfo?.name.toLowerCase() === 'smarteverything')
        this.blockedServerNames.add(server.name);
      else if (native) this.nativeServerNames.add(server.name);
    }
  }

  private captureTask(message: SDKMessage, payload: JsonValue): void {
    if (message.type === 'system' && message.subtype === 'background_tasks_changed')
      this.taskSnapshot = payload;
    if (message.type === 'system' && message.subtype === 'task_notification')
      this.taskFiles.set(message.task_id, message.output_file);
  }

  private async toolHook(input: HookInput, allowed: ReadonlySet<string>): Promise<HookJSONOutput> {
    if (input.hook_event_name !== 'PreToolUse') return {};
    if (input.mcp_server !== undefined) await this.refreshMcpServers();
    if (
      permitsProviderTool(
        {
          turn: this.options.turn,
          allowed,
          externalServers: this.externalServers,
          blocked: this.blockedServerNames,
          native: this.nativeServerNames,
          builtin: this.builtinNames,
        },
        input.tool_name,
        input.mcp_server,
      )
    )
      return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'This tool is outside the immutable chat access scope.',
      },
    };
  }

  private sdkOptions(): Options {
    return jobOptions({
      options: this.options,
      abort: this.abort,
      externalServers: this.externalServers,
      tools: this.tools,
      prompts: this.prompts,
      dialogs: this.dialogs,
      session: (): string => this.sessionId,
      toolHook: (input, allowed): Promise<HookJSONOutput> => this.toolHook(input, allowed),
    });
  }
}
