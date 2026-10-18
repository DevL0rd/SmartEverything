import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  CODEX_PROVIDER_TURN,
  type CodexProviderTurn,
  type CodexAiExecute,
  type CodexAiRead,
  type CodexProviderEvent,
  type ComputerRuntimeModel,
  type CodexProviderOptions as TurnOptions,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { CodexSessions, toolSignature } from './sessions';
import { CodexClient } from './client';
import { CodexJob } from './job';
import { launchCodex, type CodexProcessOptions } from './process';
import { requireSubscription, requireSubscriptionInference } from './account';
import { modelsOf } from './models';
import { executionOptions, threadOptions, turnOptions, validateModel } from './options';
import { TURN_REPLY, type RpcRecord, type RpcId } from './protocol';
import { requireLocalProject } from './project-access';
import { CodexRuntimeError } from './errors';
import { providerRead, providerControl } from './provider-controls';
import { CodexInputs } from './inputs';
import { providerMetadata } from './provider-metadata';
import { readRateLimits, updatedRateLimits, subscriptionBillingBlock } from './rate-limits';
import { ProviderLog } from './provider-log';
import { openThread } from './provider-thread';
import { CodexAdmission } from './provider-admission';
import { CodexProviderCommands } from './provider-commands';
import { commandDispatchDecision } from './command-request';
import { codexNotificationJob } from './provider-routing';
import { messageOf } from '@smarteverything/logging';
export interface CodexProviderRuntimeOptions extends CodexProcessOptions {
  readonly deviceId: string;
  readonly dataDirectory: string;
  readonly log: Logger;
  readonly publish: (event: CodexProviderEvent) => void;
  readonly changed: (reason: string | null) => void;
  readonly now: () => string;
}
export class CodexProvider {
  private client: CodexClient | null = null;
  private starting: Promise<CodexClient> | null = null;
  private enabled = false;
  private epoch = 0;
  private generation = randomUUID();
  private configuredOptions: TurnOptions = {};
  private observedModels: readonly ComputerRuntimeModel[] = [];
  private rateLimits: RpcRecord | null = null;
  private readonly admission: CodexAdmission;
  private readonly commands: CodexProviderCommands;
  private readonly jobs = new Map<string, CodexJob>();
  private readonly trace: ProviderLog;
  readonly sessions: CodexSessions;
  constructor(private readonly options: CodexProviderRuntimeOptions) {
    this.trace = new ProviderLog(options.log);
    this.sessions = new CodexSessions(join(options.dataDirectory, 'codex'));
    this.admission = new CodexAdmission(options.deviceId, this.jobs);
    this.commands = new CodexProviderCommands({
      ...options,
      publish: this.publish.bind(this),
      admission: this.admission,
      models: (): Promise<readonly ComputerRuntimeModel[]> => this.models(),
      observedModels: (): readonly ComputerRuntimeModel[] => this.observedModels,
      ordinaryAllowed: (): boolean => subscriptionBillingBlock(this.rateLimits) === null,
      cleanupFailed: (cause): void => {
        this.options.log.error('input.cleanup_failed', cause);
      },
      sessions: this.sessions,
      job: (id): CodexJob => this.job(id),
      current: (job): boolean =>
        this.enabled && job.client === this.client && job.generation === this.generation,
      configured: (): TurnOptions => this.configuredOptions,
      retain: (job): void => {
        this.retain(job);
      },
    });
  }
  configure(enabled: boolean, options: TurnOptions): void {
    this.trace.configured(enabled, this.enabled, this.jobs.size, this.client !== null);
    this.configuredOptions = options;
    this.enabled = enabled;
    if (!enabled) this.stop();
  }
  async ready(): Promise<CodexClient> {
    if (!this.enabled)
      throw new CodexRuntimeError(
        'provider',
        'The Codex model provider is disabled on this computer.',
      );
    if (this.starting !== null) return this.starting;
    if (this.client !== null) return this.client;
    this.starting ??= this.initialize();
    try {
      return await this.starting;
    } finally {
      this.starting = null;
    }
  }
  async models(): Promise<ComputerRuntimeModel[]> {
    const startedAt = performance.now();
    const client = await this.ready();
    await requireSubscription(client);
    this.rateLimits = await readRateLimits(client);
    this.observedModels = await modelsOf(client, this.options.deviceId);
    const blocked = subscriptionBillingBlock(this.rateLimits);
    this.trace.models(this.observedModels.length, blocked !== null, startedAt);
    if (blocked !== null)
      return this.observedModels.map((model) => ({
        ...model,
        available: false,
        reason: blocked.reason,
      }));
    return [...this.observedModels];
  }
  modalities(): ComputerRuntimeModel['input_modalities'] {
    return [...new Set(this.observedModels.flatMap((model) => model.input_modalities))];
  }
  async start(
    raw: CodexProviderTurn,
  ): Promise<{ readonly job_id: string; readonly session_id: string }> {
    const turn = CODEX_PROVIDER_TURN.parse({
      ...raw,
      options: { ...this.configuredOptions, ...raw.options },
    });
    const startedAt = performance.now();
    this.trace.received(turn, this.jobs.size);
    requireLocalProject(turn);
    this.admission.reserve(turn);
    try {
      const submitted = await this.submit(turn);
      this.trace.admitted(turn, submitted.session_id, startedAt);
      return submitted;
    } catch (cause) {
      this.trace.failed(turn, cause, startedAt);
      throw cause;
    } finally {
      this.admission.release(turn.chat_id);
    }
  }
  private async submit(
    turn: CodexProviderTurn,
  ): Promise<{ readonly job_id: string; readonly session_id: string }> {
    const client = await this.ready();
    const location = await executionOptions(
      turn.options,
      join(this.options.dataDirectory, 'codex', 'workspaces', turn.chat_id),
    );
    await requireSubscriptionInference(client, location.cwd);
    validateModel(turn, await this.models());
    await this.sessions.checkTurn(turn, location.cwd, location.roots);
    const inputs = new CodexInputs(join(this.options.dataDirectory, 'codex', 'inputs'));
    try {
      const input = await inputs.prepare(turn);
      const thread = await openThread(turn, client, location);
      this.trace.threadReady(turn, thread);
      await this.sessions.remember({
        session_id: thread,
        chat_id: turn.chat_id,
        profile_id: turn.profile_id,
        cwd: location.cwd,
        workspace_roots: [location.cwd, ...location.roots],
        tool_signature: toolSignature(turn),
      });
      const job = this.createJob({ turn, client, thread, location, inputs });
      await this.startTurn(job, turn, input);
      return { job_id: turn.job_id, session_id: job.threadId };
    } catch (cause) {
      this.trace.inputsDiscarded(turn.job_id);
      await inputs.remove();
      throw cause;
    }
  }
  private createJob(options: {
    readonly turn: CodexProviderTurn;
    readonly client: CodexClient;
    readonly thread: string;
    readonly location: { readonly cwd: string; readonly roots: readonly string[] };
    readonly inputs: CodexInputs;
  }): CodexJob {
    const { turn, client, thread, location, inputs } = options;
    const job = new CodexJob({
      turn,
      client,
      threadId: thread,
      cwd: location.cwd,
      roots: location.roots,
      publish: this.publish.bind(this),
      now: this.options.now,
      generation: this.generation,
      cleanup: (): void => {
        void inputs.remove().catch((cause: unknown): void => {
          this.options.log.error('input.cleanup_failed', cause);
        });
      },
    });
    job.usage = { ...job.usage, rate_limits: this.rateLimits };
    this.retain(job);
    job.accepted();
    return job;
  }
  private async startTurn(
    job: CodexJob,
    turn: CodexProviderTurn,
    input: RpcRecord[],
  ): Promise<void> {
    await requireSubscriptionInference(job.client, job.cwd).catch((cause: unknown): never => {
      job.rejected(messageOf(cause));
      throw cause;
    });
    try {
      const result = TURN_REPLY.parse(
        await job.client.request('turn/start', {
          threadId: job.threadId,
          input: input,
          model: turn.model,
          effort: turn.effort,
          ...threadOptions(turn.options, job.cwd, job.roots),
          ...turnOptions(turn.options),
        }),
      );
      job.started(result.turn.id);
      this.trace.turnStarted(turn, job.threadId, result.turn.id);
    } catch (cause) {
      this.trace.turnUnconfirmed(turn, job.threadId, cause);
      job.lost('The Codex turn submission was not confirmed; explicit reconciliation is required.');
      throw cause;
    }
  }
  async execute(
    request: Extract<CodexAiExecute, { operation: `provider_${string}` }>,
  ): Promise<unknown> {
    if (request.operation === 'provider_start') return this.start(request.turn);
    if (request.operation === 'provider_command')
      return this.commands.execute(
        {
          scope: request.scope,
          operation_id: request.operation_id,
          command_job_id: request.command_job_id,
          definition_id: request.definition_id,
          arguments: request.arguments,
          attachments: request.attachments,
        },
        request.configuration,
      );
    if (request.operation === 'provider_command_dispatch')
      return this.commands.dispatch(commandDispatchDecision(request));
    const job = this.job(request.job_id);
    if (request.operation === 'provider_interrupt') {
      if (!job.active || job.turnId === null)
        throw new CodexRuntimeError('interrupt', 'The Codex job has no interruptible turn.');
      this.trace.interrupting(job.turn, job.threadId, job.turnId);
      await job.client.request('turn/interrupt', { threadId: job.threadId, turnId: job.turnId });
      job.lifecycle('stopping');
      return { interrupted: true };
    }
    if (request.operation === 'provider_answer') {
      job.prompts.answer(request.prompt_id, request.answer);
      return { answered: true };
    }
    if (request.operation === 'provider_tool_result') {
      if (request.content !== undefined)
        throw new CodexRuntimeError(
          'tool_result',
          'Multimodal home-tool results are unavailable in this Codex adapter.',
        );
      job.toolResult(request.call_id, request.text, request.failed);
      return { delivered: true };
    }
    const release = this.admission.control(job);
    try {
      return await providerControl(job, request.control, this.sessions);
    } finally {
      release();
    }
  }
  async read(request: Extract<CodexAiRead, { operation: `provider_${string}` }>): Promise<unknown> {
    if (request.operation === 'provider_commands') return this.commands.catalogue(request.scope);
    if (request.operation === 'provider_command_receipt')
      return this.commands.read(request.scope, request.operation_id);
    if (request.operation === 'provider_read')
      return providerRead(this.job(request.job_id), request.query, this.sessions);
    await this.ready();
    await this.models();
    return providerMetadata(this.rateLimits, this.commands.revision());
  }
  stop(): void {
    this.trace.stopping(this.jobs.size, this.client !== null, this.epoch);
    this.epoch++;
    this.commands.stop();
    this.client?.stop();
    this.client = null;
  }
  private job(id: string): CodexJob {
    const job = this.jobs.get(id);
    if (job === undefined)
      throw new CodexRuntimeError('job', 'This Codex job is not owned by this process.');
    return job;
  }
  private publish(event: CodexProviderEvent): void {
    this.trace.event(event);
    this.options.publish(event);
    if (event.kind === 'context')
      this.job(event.job_id).emit({
        kind: 'work_item',
        type: 'nativeSkillCatalogue',
        payload: { metadata: providerMetadata(this.rateLimits, this.commands.revision()) },
      });
  }
  private retain(job: CodexJob): void {
    this.commands.retain(job);
    if (this.jobs.size >= 200)
      for (const [id, previous] of this.jobs)
        if (!previous.active) {
          this.jobs.delete(id);
          break;
        }
    this.jobs.set(job.turn.job_id, job);
  }
  private async initialize(): Promise<CodexClient> {
    const epoch = this.epoch;
    this.trace.initializing(epoch);
    const client = new CodexClient({
      process: await launchCodex(this.options, 'provider'),
      log: this.options.log,
      mode: 'provider',
      received: (method, params, id): void => {
        if (this.client === client) this.receive(method, params, id);
      },
      closed: (cause): void => {
        if (this.client === client) this.client = null;
        this.commands.clientClosed(client);
        for (const job of this.jobs.values()) if (job.client === client) job.lost(cause.message);
        this.options.changed(cause.message.slice(0, 2000));
      },
    });
    this.client = client;
    try {
      this.requireEpoch(epoch);
      await client.initialize();
      await requireSubscription(client);
      this.observedModels = await modelsOf(client, this.options.deviceId);
      this.rateLimits = await readRateLimits(client);
      this.requireEpoch(epoch);
      this.generation = randomUUID();
      this.client = client;
      this.options.changed(null);
      return client;
    } catch (cause) {
      this.trace.initializeFailed(cause);
      client.stop();
      throw cause;
    }
  }
  private requireEpoch(epoch: number): void {
    if (!this.enabled || epoch !== this.epoch)
      throw new CodexRuntimeError('initialize', 'Codex was disabled while initializing.');
  }
  private receive(method: string, params: RpcRecord, id: RpcId | null): void {
    if (method === 'skills/changed' && id === null) {
      this.commands.changed(params, [...this.jobs.values()]);
      return;
    }
    if (method === 'account/updated' && params['authMode'] !== 'chatgpt') {
      this.stop();
      return;
    }
    const current = codexNotificationJob([...this.jobs.values()], method, params);
    if (current !== undefined) current.receive(method, params, id);
    else if (id !== null)
      this.client?.reject(id, 'No authorized SmartEverything job owns this Codex request.');
    if (method === 'account/rateLimits/updated') this.updateRates(params);
  }
  private updateRates(params: RpcRecord): void {
    this.rateLimits = updatedRateLimits(this.rateLimits, params['rateLimits']);
    for (const job of this.jobs.values())
      if (job.active) {
        job.usage = {
          ...job.usage,
          rate_limits: updatedRateLimits(job.usage.rate_limits, params['rateLimits']),
        };
        job.emit({ kind: 'usage', usage: job.usage });
      }
  }
}
