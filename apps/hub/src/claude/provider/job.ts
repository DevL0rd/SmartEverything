import { assertManagedControl, assertManagedCommand, managedContext } from './managed-project';
import { nativeSourcesEnabled } from './agent-scope';
import { contextPercent } from './context-percent';
import { preToolUse } from './tool-hook';
import { runtimeEvent } from './runtime-event';
import { ProviderSource } from './source';
import { ProviderServers } from './servers';
import { ProviderCommandCatalogue } from './command-catalogue';
import {
  commandMessage,
  commandRevision,
  commandSource,
  commandResultText,
  rememberPending,
} from './command-input';
import { requireSubscription, turnScope, serializableServerResult, findModel } from './job-state';
import { requireNativeSubscriptionBilling } from './billing';
import { JobTasks } from './task-output';
import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  type HookJSONOutput,
  type HookInput,
} from '@anthropic-ai/claude-agent-sdk';
import {
  PROVIDER_EVENT,
  type ProviderEvent,
  type ProviderTurn,
  type ProviderContent,
  type ProviderAnswer,
  type JsonValue,
  CLAUDE_MCP_SERVERS,
  type ClaudeMcpServers,
  type ProviderControl,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ProviderInput, ProviderInputError, userMessageOf } from './input';
import { ProviderSteers } from './steers';
import { JobLog } from './job-log';
import { jobOptions } from './job-options';
import { flagSettings } from './settings';
import { modelOptions } from './options';
import { ProviderDialogs } from './dialogs';
import { ProviderPrompts } from './prompts';
import { ProviderTools, type ProviderToolResult } from './tools';
import { controlledTurn } from './turn-controls';
import { messageEvents, resultEvents, type ProviderPayload } from './events';
import { messageOf } from '@smarteverything/logging';
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
  private readonly servers = new ProviderServers();
  private initialization: Record<string, JsonValue> = {};
  private readonly taskList = new JobTasks();
  private readonly trace: JobLog;
  private readonly steers: ProviderSteers;
  constructor(public options: ProviderJobOptions) {
    this.trace = new JobLog(
      options.log,
      () => this.options.turn,
      () => this.sessionId,
    );
    this.steers = new ProviderSteers(this.input, this.trace);
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
    this.trace.created(options.turn, this.externalServers);
  }
  async start(): Promise<void> {
    const startedAt = performance.now();
    const initialized = await this.query.initializationResult();
    requireSubscription(initialized.account);
    const model = findModel(initialized.models, this.options.turn.model);
    if (model === undefined) {
      this.trace.modelUnavailable(this.options.turn.model, initialized.models);
      throw new ProviderInputError('The requested model is not available on this computer.');
    }
    const chosen = modelOptions(this.options.turn, model);
    this.trace.modelChosen(model.value, model.resolvedModel, chosen.effort);
    if (chosen.effort !== undefined)
      await this.query.applyFlagSettings({ effortLevel: chosen.effort });
    await this.query.applyFlagSettings(flagSettings(this.options.turn.options.flag_settings ?? {}));
    await this.refreshMcpServers();
    await this.commands.refresh(this.query);
    await requireNativeSubscriptionBilling(this.query);
    this.trace.turnStarted(startedAt, this.commands.revision, initialized.models.length);
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
    const model = findModel(await this.query.supportedModels(), turn.model);
    if (model === undefined)
      throw new ProviderInputError('The requested model is not available on this computer.');
    const chosen = modelOptions(turn, model);
    await this.query.setModel(turn.model);
    await this.query.applyFlagSettings({ effortLevel: chosen.effort ?? null });
    await this.query.applyFlagSettings(flagSettings(turn.options.flag_settings ?? {}));
    await this.refreshMcpServers();
    await requireNativeSubscriptionBilling(this.query);
    this.options = { ...this.options, turn };
    this.seq = 0;
    this.interrupted = false;
    this.running = true;
    this.nativeCommand = false;
    this.textObserved = false;
    this.trace.turnContinued(turn.model);
    this.input.push(message);
  }
  steer(content: readonly ProviderContent[]): boolean {
    if (!this.active || this.nativeCommand) return false;
    this.steers.add(content);
    return true;
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
    this.trace.commandSent(name, argumentsText.length);
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
    return this.taskList.list();
  }
  taskOutput(id: string): Promise<JsonValue> {
    return this.taskList.output(
      id,
      () => new ProviderInputError('The SDK did not publish an output file for this owned task.'),
    );
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
    this.trace.interrupting();
    this.steers.clear();
    await this.query.interrupt({ cancelQueued: true });
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
    this.trace.stopped(this.interrupted, this.running);
    this.input.close();
    this.prompts.stop();
    this.dialogs.stop();
    this.tools.stop();
    this.query.close();
    this.abort.abort();
  }
  fail(cause: unknown): void {
    this.trace.failed(cause, this.interrupted, this.running);
    this.emit({
      kind: 'failed',
      code: 'provider_failed',
      message: messageOf(cause).slice(0, 2000),
    });
    this.stop();
  }
  private emit(payload: ProviderPayload): void {
    this.trace.emit(payload.kind, this.seq + 1);
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
      if (message.type === 'result') await this.finishTurn(message);
      else this.emitAll(messageEvents(message));
    }
    if (this.running && !this.closed) {
      this.trace.streamEndedEarly();
      throw new ProviderInputError('The local Claude process closed without a turn result.');
    }
    this.stop();
  }

  private emitAll(events: readonly ProviderPayload[]): void {
    for (const event of events) {
      if (event.kind === 'text') this.textObserved = true;
      this.emit(event);
    }
  }

  private async finishTurn(message: SDKResultMessage): Promise<void> {
    const events = resultEvents(
      message,
      this.interrupted,
      await contextPercent(this.query, this.trace),
    );
    const succeeded = message.subtype === 'success' && !message.is_error && !this.interrupted;
    if (this.steers.followUp(succeeded)) {
      this.emitAll(events.filter((event) => event.kind === 'usage'));
      return;
    }
    this.emitAll(events);
    this.running = false;
    this.trace.turnFinished(message.subtype, this.interrupted);
  }

  private observeMessage(message: SDKMessage): void {
    if (
      this.nativeCommand &&
      message.session_id !== undefined &&
      message.session_id !== this.sessionId
    ) {
      this.trace.sessionMismatch(message.session_id);
      throw new ProviderInputError(
        'A native command returned a different session; shared ownership was not rebound.',
      );
    }
    if (message.session_id !== undefined) {
      if (message.session_id !== this.sessionId) this.trace.sessionRebound(message.session_id);
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
    const event = runtimeEvent(
      {
        turn: this.options.turn,
        cwd: this.options.cwd,
        tasks: this.taskList,
        source: this.source,
        commands: this.commands,
        initialize: (init, record): void => {
          this.captureInitialization(init, record);
        },
      },
      message,
    );
    if (event !== null) this.emit(event);
  }

  private captureInitialization(
    message: Extract<SDKMessage, { type: 'system'; subtype: 'init' }>,
    record: Record<string, JsonValue>,
  ): void {
    this.initialization = { ...record, ...managedContext(this.options.turn) };
    for (const tool of message.tools) if (!tool.startsWith('mcp__')) this.servers.builtin.add(tool);
  }

  private refreshMcpServers(): Promise<void> {
    return this.servers.refresh(this.query, nativeSourcesEnabled(this.options.turn), this.trace);
  }

  private toolHook(input: HookInput, allowed: ReadonlySet<string>): Promise<HookJSONOutput> {
    return preToolUse(
      {
        turn: this.options.turn,
        externalServers: this.externalServers,
        servers: this.servers,
        trace: this.trace,
        refreshMcpServers: (): Promise<void> => this.refreshMcpServers(),
      },
      input,
      allowed,
    );
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
      toolBoundary: (): void => {
        this.steers.deliver();
      },
      toolHook: (input, allowed): Promise<HookJSONOutput> => this.toolHook(input, allowed),
    });
  }
}
