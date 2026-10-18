import { NativeReferences } from '../references/runtime';
import { mountReferencePrompts } from '../references/prompt';
import type {
  AiNativeReferenceAction,
  AiNativeReferenceResult,
  AiReference,
} from '@smarteverything/domain';
import { mountManagedPackageExecution } from '../composition/plugin-execution';
import { projectWorkspaceContext } from '../composition/workspace-context';
import { HarnessRuntimeError } from './errors';
import type { AiHarnessStorageBinding } from '@smarteverything/domain';
import { nativePendingInput, type NativeInputHistory } from './input-history';
import type { Context } from '@deepseek-ai/cordis';
import type {
  AdmittedPromptContentPart,
  AttachmentAdmissionPart,
  EncodedFileAttachment,
  FileAttachmentRef,
} from '@deepseek-ai/dsh-attachment';
import type { AgentHandle, Agent } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import { harnessManifest } from './manifest';
import type { AiHarnessManifest } from '@smarteverything/domain';
import { Logger, background, describeFailure } from '@smarteverything/logging';
import type { HarnessConfiguration } from '../composition/configuration';
import type {
  HarnessDesiredConfiguration,
  HarnessPluginReadiness,
  InstalledHarnessPlugin,
} from '../composition/configuration';
import type { NativeSessionPersistencePort } from '../persistence/port';
import type { HarnessInteractions, HarnessInteractionPort } from './interactions';
import { HARNESS_SESSION_OPTIONS, agentOptions } from './contracts';
import type { HarnessHost, HarnessSessionOptions } from './contracts';
import { HarnessSession } from './session';
import { setSessionPermission } from './permission';
import type { HarnessServerPolicy } from './server-policy';
import type { HarnessServerToolAccess } from './server-policy';
import type { HarnessRuntimeEvent } from './events';
import { HarnessAdmission } from './admission';
import { HarnessRuntimeConfiguration } from './runtime-configuration';
import type {
  HarnessConfigurationPending,
  HarnessRuntimeConfigurationState,
} from './runtime-configuration';

export interface HarnessRuntimeOptions {
  readonly host: HarnessHost;
  readonly persistence: NativeSessionPersistencePort;
  readonly interactions: HarnessInteractionPort;
  readonly desiredConfiguration: HarnessDesiredConfiguration;
  readonly installedPlugins: readonly InstalledHarnessPlugin[];
  readonly configurationChanged: () => void;
  readonly configurationPending?: HarnessConfigurationPending;
  readonly serverToolAccess?: HarnessServerToolAccess;
  readonly onEvent: (event: HarnessRuntimeEvent) => void;
  readonly beforeStep?: (id: string) => Promise<void>;
  readonly installModelRoutes: (ctx: Context) => Promise<void>;
}

export class HarnessRuntime {
  private readonly sessions = new Map<string, HarnessSession>();
  private readonly opening = new Set<string>();
  private readonly storage = new Map<string, AiHarnessStorageBinding>();
  private readonly admission = new HarnessAdmission();
  private readonly composition: HarnessRuntimeConfiguration;
  private readonly references: NativeReferences;
  private readonly log = new Logger('hub.harness');

  constructor(
    private readonly ctx: Context,
    private readonly host: HarnessHost,
    private readonly configuration: HarnessConfiguration,
    private readonly lifecycle: {
      readonly interactions: HarnessInteractions;
      readonly dispose: () => Promise<void>;
      readonly serverPolicy: HarnessServerPolicy;
      readonly generation: string;
      readonly notify: (event: HarnessRuntimeEvent) => void;
      readonly configurationPending?: HarnessConfigurationPending;
    },
  ) {
    this.references = new NativeReferences(
      ctx,
      (id) => this.executionWorkspace(id),
      () => this.configurationStatus(),
    );
    mountReferencePrompts(ctx);
    this.composition = new HarnessRuntimeConfiguration(
      configuration,
      lifecycle.configurationPending,
    );
  }

  referenceOperation(id: string, input: AiNativeReferenceAction): Promise<AiNativeReferenceResult> {
    this.get(id);
    return this.references.execute(id, input);
  }

  resolveReferences(id: string, references: readonly AiReference[]): Promise<void> {
    this.get(id);
    return this.references.resolve(id, references);
  }

  create(input: HarnessSessionOptions): Promise<HarnessSession> {
    return this.admission.run(() => this.open(input, false), input.sessionId);
  }

  resume(input: HarnessSessionOptions): Promise<HarnessSession> {
    return this.admission.run(() => this.open(input, true), input.sessionId);
  }

  storageBinding(id: string): AiHarnessStorageBinding | undefined {
    return this.storage.get(id);
  }

  assertNativeAccess(id: string): void {
    this.get(id);
    this.lifecycle.serverPolicy.requireNative(id);
  }

  async directory(id: string, path: string, signal?: AbortSignal): Promise<string> {
    this.assertNativeAccess(id);
    const session = this.get(id);
    const directory = await session.directory(path, signal);
    this.references.closeSession(id);
    await session.flush();
    return directory;
  }

  private executionWorkspace(id: string): AiHarnessStorageBinding | undefined {
    const agent = this.ctx.agents.get(SessionId(id));
    return agent === undefined || this.host.target.kind !== 'device'
      ? undefined
      : {
          kind: 'device',
          target: this.host.target,
          path: this.ctx.workingDirectory.get(agent.session),
        };
  }

  get(id: string): HarnessSession {
    const session = this.sessions.get(id);
    if (session === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${id} is not active on this host.`,
      );
    return session;
  }

  ownershipLost(id: string): void {
    const session = this.sessions.get(id);
    if (session === undefined) return;
    void session.ownershipLost().catch((error: unknown) => {
      this.log.error('session.cleanup_failed', error, { session_id: id });
      this.lifecycle.notify({ kind: 'error', sessionId: id, failure: describeFailure(error) });
    });
  }

  whenOwnershipLossSettled(id: string): Promise<void> {
    return this.get(id).whenOwnershipLossSettled();
  }

  async close(id: string): Promise<void> {
    await this.admission.cleanup(() => this.closeSession(id), id);
    await this.admission.cleanup(() => this.applyIdleConfiguration());
  }

  dispose(): Promise<void> {
    this.log.info('runtime.disposing', { open: this.sessions.size, opening: this.opening.size });
    this.composition.suspend();
    return this.admission.shutdown(async (): Promise<void> => {
      const closed = await Promise.allSettled(
        [...this.sessions.keys()].map((id) => this.closeSession(id)),
      );
      this.references.close();
      const configured = await Promise.allSettled([this.configuration.dispose()]);
      const disposed = await Promise.allSettled([this.lifecycle.dispose()]);
      const failures: unknown[] = [];
      for (const result of [...closed, ...configured, ...disposed]) {
        if (result.status === 'rejected') {
          const cause: unknown = result.reason;
          this.log.error('runtime.dispose_step_failed', cause);
          failures.push(cause);
        }
      }
      if (failures.length > 0)
        throw new HarnessRuntimeError(
          'source_outcome_unknown',
          'Native runtime cleanup or durability could not be confirmed.',
          null,
          { cause: new AggregateError(failures, 'Native runtime disposal failed.') },
        );
    });
  }

  private async closeSession(id: string): Promise<void> {
    const startedAt = performance.now();
    this.references.closeSession(id);
    await this.get(id).close();
    this.sessions.delete(id);
    this.lifecycle.serverPolicy.unbind(id);
    this.storage.delete(id);
    this.log.info('session.closed', {
      session_id: id,
      open: this.sessions.size,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  settleConfiguration(): void {
    if (!this.composition.hasPending()) return;
    background(
      this.admission.cleanup(() => this.applyIdleConfiguration()),
      'admission.cleanup_failed',
    );
  }

  private async applyIdleConfiguration(): Promise<void> {
    if (!this.composition.hasPending() || !this.quiet()) {
      this.log.trace('configuration.apply_deferred', () => ({
        pending: this.composition.hasPending(),
        sessions: this.sessions.size,
      }));
      return;
    }
    this.log.debug('configuration.applying_idle', { sessions: this.sessions.size });
    await this.composition.applyPending().catch((error: unknown) => {
      this.log.error('configuration.apply_failed', error);
    });
  }

  private quiet(): boolean {
    return (
      this.opening.size === 0 && [...this.sessions.values()].every((session) => session.quiet())
    );
  }

  manifest(): AiHarnessManifest {
    return harnessManifest(this.ctx, this.configuration);
  }

  pendingInput(input: NativeInputHistory): readonly string[] {
    return nativePendingInput(this.ctx, input);
  }

  nativeGeneration(): string {
    return this.lifecycle.generation;
  }

  admitPromptContent(
    content: readonly AttachmentAdmissionPart[],
  ): Promise<AdmittedPromptContentPart[]> {
    return this.ctx.attachments.admitPromptContent(content);
  }

  admitFile(input: EncodedFileAttachment): Promise<FileAttachmentRef> {
    return this.ctx.attachments.admitEncodedFile(input);
  }

  attachmentPath(ref: FileAttachmentRef): string | undefined {
    return this.ctx.attachments.fileHostPath(ref);
  }

  configure(input: HarnessDesiredConfiguration): Promise<void> {
    return this.admission.run(async (): Promise<void> => {
      this.composition.request(input);
      if (!this.composition.hasPending()) {
        this.log.debug('configuration.unchanged', { sessions: this.sessions.size });
        return;
      }
      if (!this.quiet()) {
        this.log.info('configuration.waiting', {
          sessions: this.sessions.size,
          opening: this.opening.size,
        });
        this.composition.waiting();
        return;
      }
      const startedAt = performance.now();
      this.log.info('configuration.applying', { sessions: this.sessions.size });
      await this.composition.applyPending();
      this.log.info('configuration.applied', {
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
  }

  configurationStatus(): readonly HarnessPluginReadiness[] {
    return this.configuration.snapshot();
  }

  configurationState(): HarnessRuntimeConfigurationState {
    return this.composition.state();
  }

  private async open(input: HarnessSessionOptions, resume: boolean): Promise<HarnessSession> {
    const options = HARNESS_SESSION_OPTIONS.parse(input);
    if (this.sessions.has(options.sessionId) || this.opening.has(options.sessionId))
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${options.sessionId} is already open on this host.`,
      );
    this.opening.add(options.sessionId);
    const startedAt = performance.now();
    const fields = {
      session_id: options.sessionId,
      resumed: resume,
      provider: options.provider,
      model: options.model,
    };
    this.log.debug('session.opening', () => ({
      ...fields,
      hasStorageBinding: options.storageBinding !== undefined,
      helper: options.pluginAgentPolicy !== undefined,
      opening: this.opening.size,
    }));
    try {
      if (options.storageBinding !== undefined)
        this.storage.set(options.sessionId, options.storageBinding);
      this.lifecycle.serverPolicy.bind(options.sessionId, options.authority);
      await this.ctx.llm.resolveModelInfo(options.provider, options.model);
      const handle = await this.acquire(options, resume);
      const session = new HarnessSession(this.ctx, handle, this.lifecycle.interactions, () => {
        this.settleConfiguration();
      });
      this.sessions.set(options.sessionId, session);
      this.log.info('session.opened', {
        ...fields,
        open: this.sessions.size,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return session;
    } catch (error) {
      this.log.error('session.open_failed', error, {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
      });
      this.lifecycle.serverPolicy.unbind(options.sessionId);
      this.storage.delete(options.sessionId);
      throw error;
    } finally {
      this.opening.delete(options.sessionId);
    }
  }

  private async acquire(options: HarnessSessionOptions, resume: boolean): Promise<AgentHandle> {
    const setup = async (agentCtx: Context, agent: Agent): Promise<void> => {
      const allowed = this.lifecycle.serverPolicy.allowed(options.sessionId);
      if (allowed !== undefined) agentCtx.tools.restrict({ allow: allowed });
      await this.ctx.workingDirectory.set(agent, options.directory ?? this.host.homeDirectory);
      agentCtx.systemPrompt.section({
        name: 'smarteverything-host',
        order: 0,
        interpolate: false,
        text: () => this.hostContext(agent),
      });
      if (options.permission !== undefined)
        setSessionPermission(this.ctx, agent, options.permission);
      await mountManagedPackageExecution(this.ctx, agentCtx, {
        directory: this.ctx.workingDirectory.get(agent.session),
        native: this.lifecycle.serverPolicy.nativeAvailable(options.sessionId),
      });
      this.setupHelper(agentCtx, options);
    };
    const shared = { agentOptions: agentOptions(options), setup };
    const handle = resume
      ? await this.ctx.agents.resume({ resumeSessionId: SessionId(options.sessionId), ...shared })
      : await this.ctx.agents.create({
          sessionId: SessionId(options.sessionId),
          meta: {
            cwd: options.directory ?? this.host.homeDirectory,
            agentPreset: 'smarteverything',
          },
          ...shared,
        });
    try {
      await this.ctx.sessions.flush(handle.agent.session);
      return handle;
    } catch (error) {
      await handle.dispose();
      throw error;
    }
  }

  private setupHelper(agentCtx: Context, options: HarnessSessionOptions): void {
    const policy = options.pluginAgentPolicy;
    if (policy === undefined) return;
    if (policy.tools !== undefined) agentCtx.tools.restrict({ allow: policy.tools });
    agentCtx.systemPrompt.context({
      name: 'smarteverything-helper',
      order: 10,
      required: true,
      interpolate: false,
      text: policy.persona,
    });
  }

  private hostContext(agent: Agent): string {
    const server = this.host.target.kind === 'server';
    const local = this.lifecycle.serverPolicy.nativeAvailable(agent.id);
    const execution = local
      ? 'Native file and shell tools use this selected machine under the chat permission. The primary folder selects working and indexing context; it does not grant access.'
      : 'Native read, write, edit, glob and grep work inside this chat’s folder; there is no shell on the Hub.';
    return `Current execution host: ${this.host.name} (${JSON.stringify(this.host.target)}). ${execution} ${projectWorkspaceContext(server)}`;
  }
}

export { createHarnessRuntime } from './create-runtime';
