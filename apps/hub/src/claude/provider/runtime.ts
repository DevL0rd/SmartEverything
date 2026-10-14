import { createHash } from 'node:crypto';
import { getSessionInfo, getSessionMessages, type Query } from '@anthropic-ai/claude-agent-sdk';
import {
  PROVIDER_TURN,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
  type AiNativeCommandDispatch,
  type ComputerAiModel,
  type ClaudeProviderOptions,
  type ProviderTurn,
  type ProviderEvent,
  type ProviderAnswer,
  type ProviderMetadata,
  type ProviderControl,
  type ComputerAiRead,
  type JsonValue,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { ProviderInputError } from './input';
import { ProviderJob } from './job';
import { metadataOf } from './metadata';
import { requireNativeSubscriptionBilling } from './billing';
import {
  connectionReadRequest,
  connectionRead,
  validateTurnSize,
  readModels,
  jobMetadata,
  closeProbe,
} from './runtime-reads';
import { ClaudeProviderCommands } from './commands';
import { providerProbe } from './runtime-probe';
import { assertManagedTurn, assertManagedControl } from './managed-project';
import { workDirectory } from './options';
import type { ProviderToolResult } from './tools';
import { ProviderSessions } from './sessions';
import { ProviderReceipts } from './receipts';
import { controlProvider, jsonOf } from './control';
export interface ClaudeProviderRuntimeOptions {
  readonly deviceId: string;
  readonly directory: string;
  readonly executable?: string;
  readonly log: Logger;
  readonly publish: (event: ProviderEvent) => void;
}
export class ClaudeProviderRuntime {
  private readonly jobs = new Map<string, ProviderJob>();
  private readonly receipts: ProviderReceipts;
  private readonly starting = new Set<string>();
  private readonly sessions: ProviderSessions;
  private readonly commandHandler: ClaudeProviderCommands;
  private options: ClaudeProviderOptions = { builtin_tools: [] };
  private enabled = false;
  private discovery: Promise<Query> | null = null;
  private stopped = false;
  constructor(private readonly config: ClaudeProviderRuntimeOptions) {
    this.sessions = new ProviderSessions(config.directory);
    this.receipts = new ProviderReceipts(config.directory);
    this.commandHandler = new ClaudeProviderCommands({
      deviceId: config.deviceId,
      receipts: this.receipts,
      job: (id): ProviderJob => this.job(id),
      current: (job): boolean => this.jobs.get(job.options.turn.job_id) === job,
      reserve: (job): (() => void) => this.reserve(job),
      check: (job): Promise<void> => this.checkCommand(job),
      retain: (previousId, jobId, job): void => {
        this.jobs.delete(previousId);
        this.jobs.set(jobId, job);
      },
    });
  }
  private async checkCommand(job: ProviderJob): Promise<void> {
    const cwd = await workDirectory(this.config.directory, job.options.turn.options);
    if (cwd !== job.options.cwd)
      throw new ProviderInputError('The native execution folder changed.');
    await this.sessions.check(
      job.session,
      job.options.turn.chat_id,
      job.options.turn.profile_id,
      cwd,
    );
  }
  configure(enabled: boolean, options: ClaudeProviderOptions): void {
    this.enabled = enabled;
    this.options = options;
    this.stopProbe();
    if (!enabled) {
      this.closeJobs();
    }
  }
  async models(): Promise<ComputerAiModel[]> {
    return readModels(await this.probe(), this.config.deviceId);
  }
  async metadata(id: string | undefined): Promise<ProviderMetadata> {
    return id === undefined ? metadataOf(await this.probe()) : jobMetadata(this.job(id));
  }

  async start(
    raw: ProviderTurn,
  ): Promise<{ readonly job_id: string; readonly session_id: string | null }> {
    this.ready();
    const turn = PROVIDER_TURN.parse(raw);
    validateTurnSize(turn);
    assertManagedTurn(turn);
    if (turn.device_id !== this.config.deviceId) {
      throw new ProviderInputError('The provider job was addressed to another computer.');
    }
    const key = JSON.stringify([turn.chat_id, turn.profile_id, turn.session_id]);
    if (this.starting.has(key))
      throw new ProviderInputError(
        'Another provider submission is awaiting admission for this session.',
      );
    this.starting.add(key);
    try {
      await requireNativeSubscriptionBilling(await this.probe());
      return await this.admitTurn(turn);
    } finally {
      this.starting.delete(key);
    }
  }

  private async admitTurn(
    turn: ProviderTurn,
  ): Promise<{ readonly job_id: string; readonly session_id: string | null }> {
    const cwd = await workDirectory(this.config.directory, turn.options);
    const previous = this.sessionJob(turn.session_id);
    await this.sessions.check(turn.session_id, turn.chat_id, turn.profile_id, cwd);
    await this.sessions.checkProject(turn);
    if (previous === undefined && turn.session_id !== null) {
      await this.sessions.resumable(turn.session_id);
      if ((await getSessionInfo(turn.session_id, { dir: cwd })) === undefined)
        throw new ProviderInputError(
          'This owned native session no longer has a persisted transcript to resume.',
        );
    }
    const signature = createHash('sha256').update(JSON.stringify(turn)).digest('hex');
    const known = await this.receipts.admit({
      job_id: turn.job_id,
      signature,
      session_id: turn.session_id,
    });
    if (known !== null) {
      if (!this.jobs.has(turn.job_id))
        throw new ProviderInputError(
          'This provider job was already admitted, but its process outcome is unknown. It will never be submitted again.',
        );
      return { job_id: turn.job_id, session_id: known.session_id };
    }
    this.ready();
    if (turn.session_id === null) {
      await this.sessions.available(turn.job_id);
      if ((await getSessionInfo(turn.job_id, { dir: cwd })) !== undefined)
        throw new ProviderInputError(
          'A new provider job cannot adopt an existing unowned native transcript.',
        );
    }
    if (previous !== undefined) {
      const previousId = previous.options.turn.job_id;
      await previous.continue(turn);
      this.jobs.delete(previousId);
      this.jobs.set(turn.job_id, previous);
      return { job_id: turn.job_id, session_id: turn.session_id };
    }
    return this.startJob(turn, cwd);
  }

  private startJob(
    turn: ProviderTurn,
    cwd: string,
  ): { readonly job_id: string; readonly session_id: string | null } {
    if (this.jobs.size >= 64)
      throw new ProviderInputError(
        'Close an existing provider job before starting more work on this computer.',
      );
    const job = new ProviderJob({
      turn,
      cwd,
      log: this.config.log,
      publish: (event): void => {
        this.event(event, cwd, job.options.turn);
      },
      ...(this.config.executable === undefined ? {} : { executable: this.config.executable }),
    });
    this.jobs.set(turn.job_id, job);
    void job.start().catch((cause: unknown) => {
      job.fail(cause);
    });
    return { job_id: turn.job_id, session_id: turn.session_id };
  }

  commands(scope: AiNativeCommandScope): ReturnType<ClaudeProviderCommands['catalogue']> {
    return this.commandHandler.catalogue(scope);
  }
  command(input: AiNativeCommandWrite): ReturnType<ClaudeProviderCommands['execute']> {
    return this.commandHandler.execute(input);
  }
  commandDispatch(input: AiNativeCommandDispatch): ReturnType<ClaudeProviderCommands['dispatch']> {
    return this.commandHandler.dispatch(input);
  }
  commandReceipt(
    scope: AiNativeCommandScope,
    id: string,
  ): ReturnType<ClaudeProviderCommands['read']> {
    return this.commandHandler.read(scope, id);
  }
  private reserve(job: ProviderJob): () => void {
    const key = JSON.stringify([
      job.options.turn.chat_id,
      job.options.turn.profile_id,
      job.session,
    ]);
    if (this.starting.has(key))
      throw new ProviderInputError('Another native submission is awaiting admission.');
    this.starting.add(key);
    return (): void => {
      this.starting.delete(key);
    };
  }

  async read(
    id: string,
    request: Extract<ComputerAiRead, { operation: 'provider_read' }>['query'],
  ): Promise<JsonValue> {
    const job = this.job(id);
    if (connectionReadRequest(request)) return connectionRead(job, request);
    switch (request.kind) {
      case 'context':
        return jsonOf(await job.query.getContextUsage({ detail: request.detail }));
      case 'usage':
        return jsonOf(
          await job.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
            skipBehaviors: request.skip_behaviors,
          }),
        );
      case 'file':
        return jsonOf(
          await job.query.readFile(request.path, {
            maxBytes: request.max_bytes,
            encoding: request.encoding,
          }),
        );
      case 'tasks':
        return job.tasks();
      case 'task_output':
        return job.taskOutput(request.task_id);
      case 'sessions':
        return jsonOf(
          this.sessions
            .list(job.options.turn.chat_id, job.options.turn.profile_id)
            .slice(0, request.limit),
        );
      case 'session_info':
        this.checkSession(job, request.session_id);
        return jsonOf(await getSessionInfo(request.session_id, { dir: job.options.cwd }));
      case 'session_messages':
        this.checkSession(job, request.session_id);
        return jsonOf(
          await getSessionMessages(request.session_id, {
            dir: job.options.cwd,
            limit: request.limit,
          }),
        );
    }
  }

  async control(id: string, control: ProviderControl): Promise<JsonValue> {
    const job = this.job(id);
    const release = this.reserve(job);
    let result: JsonValue;
    try {
      result = await this.applyControl(job, control);
    } finally {
      release();
    }
    job.rememberControl(control);
    if (control.action === 'close') this.jobs.delete(id);
    if (control.action === 'delete_session') {
      await this.sessions.forget(control.session_id);
      if (job.session === control.session_id) {
        job.stop();
        this.jobs.delete(id);
      }
    }
    return result;
  }

  private applyControl(job: ProviderJob, control: ProviderControl): Promise<JsonValue> {
    assertManagedControl(job.options.turn, control);
    return controlProvider(
      {
        query: job.query,
        setMcpServers: (servers) => job.setMcpServers(servers),
        cwd: job.options.cwd,
        session: job.session,
        stop: () => {
          job.stop();
        },
        owns: (sessionId) => this.owns(job, sessionId),
        remember: (sessionId) =>
          this.sessions.remember({
            session_id: sessionId,
            chat_id: job.options.turn.chat_id,
            profile_id: job.options.turn.profile_id,
            cwd: job.options.cwd,
            ...(job.options.turn.managed_project === undefined
              ? {}
              : { managed_project: job.options.turn.managed_project }),
          }),
      },
      control,
    );
  }

  interrupt(id: string): Promise<boolean> {
    return this.job(id).interrupt();
  }
  answer(id: string, promptId: string, answer: ProviderAnswer): boolean {
    return this.job(id).answer(promptId, answer);
  }
  toolResult(id: string, callId: string, result: ProviderToolResult): boolean {
    return this.job(id).toolResult(callId, result);
  }

  stop(): void {
    this.stopped = true;
    this.closeJobs();
    this.stopProbe();
  }

  private event(event: ProviderEvent, cwd: string, turn: ProviderTurn): void {
    if (event.kind === 'accepted') {
      void this.sessions
        .remember({
          session_id: event.session_id,
          chat_id: turn.chat_id,
          profile_id: turn.profile_id,
          cwd,
          resumable: turn.options.persist_session !== false,
          ...(turn.managed_project === undefined ? {} : { managed_project: turn.managed_project }),
        })
        .catch((cause: unknown) => {
          this.jobs.get(turn.job_id)?.fail(cause);
        });
    }
    this.commandHandler.event(event);
    this.config.publish(event);
  }

  private sessionJob(id: string | null): ProviderJob | undefined {
    if (id === null) return undefined;
    return [...this.jobs.values()].find((job) => job.session === id);
  }

  private owns(job: ProviderJob, sessionId: string): boolean {
    return this.sessions.owns(
      sessionId,
      job.options.turn.chat_id,
      job.options.turn.profile_id,
      job.options.cwd,
    );
  }

  private checkSession(job: ProviderJob, sessionId: string): void {
    if (!this.owns(job, sessionId)) {
      throw new ProviderInputError('This provider session is not bound to the requesting chat.');
    }
  }

  private job(id: string): ProviderJob {
    this.ready();
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new ProviderInputError('The provider job is not owned by this computer runtime.');
    }
    return job;
  }

  private ready(): void {
    if (!this.enabled || this.stopped) {
      throw new ProviderInputError('The Claude model provider is disabled on this computer.');
    }
  }

  private probe(): Promise<Query> {
    this.ready();
    this.discovery ??= providerProbe({
      directory: this.config.directory,
      options: this.options,
      ...(this.config.executable === undefined ? {} : { executable: this.config.executable }),
    }).catch((cause: unknown) => {
      this.discovery = null;
      throw cause;
    });
    return this.discovery;
  }

  private closeJobs(): void {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
  }
  private stopProbe(): void {
    closeProbe(this.discovery, this.config.log);
    this.discovery = null;
  }
}
