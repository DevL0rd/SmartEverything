import { projectWorkspaceContext } from '../composition/workspace-context';
import { bootComposition, initializeRuntime } from '../composition/runtime';
import { HarnessRuntimeError } from './errors';
import { installManagedImage } from '../composition/project-image';
import { ProjectFileSystem } from '../composition/project-filesystem';
import type { AiHarnessStorageBinding } from '@smarteverything/domain';
import type { ProjectFilePort } from '../composition/project-files';
import { nativePendingInput, type NativeInputHistory } from './input-history';
import { Context } from '@deepseek-ai/cordis';
import { createHash } from 'node:crypto';
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
import { Logger, describeFailure } from '@smarteverything/logging';
import type { HarnessConfiguration } from '../composition/configuration';
import type {
  HarnessDesiredConfiguration,
  HarnessPluginReadiness,
  InstalledHarnessPlugin,
} from '../composition/configuration';
import type { NativeSessionPersistencePort } from '../persistence/port';
import type { HarnessInteractions, HarnessInteractionPort } from './interactions';
import { HARNESS_HOST, HARNESS_SESSION_OPTIONS, agentOptions } from './contracts';
import type { HarnessHost, HarnessSessionOptions } from './contracts';
import { HarnessSession } from './session';
import { initializeSessionPermission } from './permission';
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
  readonly configurationChanged: (
    revision: string,
    readiness: readonly HarnessPluginReadiness[],
  ) => void;
  readonly configurationPending?: HarnessConfigurationPending;
  readonly serverToolAccess?: HarnessServerToolAccess;
  readonly projectFiles?: ProjectFilePort;
  readonly onEvent: (event: HarnessRuntimeEvent) => void;
  readonly beforeStep?: (id: string) => Promise<void>;
  readonly installModelRoutes: (ctx: Context) => Promise<void>;
}

export class HarnessRuntime {
  private readonly sessions = new Map<string, HarnessSession>();
  private readonly opening = new Set<string>();
  private readonly admission = new HarnessAdmission();
  private readonly composition: HarnessRuntimeConfiguration;
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
    this.composition = new HarnessRuntimeConfiguration(
      configuration,
      lifecycle.configurationPending,
    );
  }

  create(input: HarnessSessionOptions): Promise<HarnessSession> {
    return this.admission.run(() => this.open(input, false));
  }

  resume(input: HarnessSessionOptions): Promise<HarnessSession> {
    return this.admission.run(() => this.open(input, true));
  }

  storageBinding(id: string): AiHarnessStorageBinding | undefined {
    return this.ctx.fs instanceof ProjectFileSystem ? this.ctx.fs.scopes.binding(id) : undefined;
  }

  deviceWorkspace(id: string, path: string): void {
    this.get(id);
    if (this.host.target.kind !== 'device')
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Hub conversations cannot select local device workspaces.',
      );
    if (this.ctx.fs instanceof ProjectFileSystem)
      this.ctx.fs.scopes.bind(id, { kind: 'device', target: this.host.target, path });
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

  close(id: string): Promise<void> {
    return this.admission.cleanup(() => this.closeSession(id));
  }

  dispose(): Promise<void> {
    this.composition.suspend();
    return this.admission.shutdown(async (): Promise<void> => {
      const closed = await Promise.allSettled(
        [...this.sessions.keys()].map((id) => this.closeSession(id)),
      );
      const configured = await Promise.allSettled([this.configuration.dispose()]);
      const disposed = await Promise.allSettled([this.lifecycle.dispose()]);
      const failures: unknown[] = [];
      for (const result of [...closed, ...configured, ...disposed]) {
        if (result.status === 'rejected') {
          const cause: unknown = result.reason;
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
    await this.get(id).close();
    this.sessions.delete(id);
    this.lifecycle.serverPolicy.unbind(id);
    if (this.ctx.fs instanceof ProjectFileSystem) this.ctx.fs.scopes.bind(id, undefined);
    this.log.info('session.closed', { session_id: id });
    if (this.sessions.size === 0 && this.opening.size === 0)
      await this.composition.applyPending().catch((error: unknown) => {
        this.log.error('configuration.apply_failed', error);
        this.lifecycle.notify({ kind: 'error', sessionId: id, failure: describeFailure(error) });
      });
  }

  manifest(): AiHarnessManifest {
    return {
      ...harnessManifest(this.ctx, this.host, this.configuration, {
        fingerprint: this.fingerprint(),
        restoreRevision: this.restoreRevision(),
      }),
      ...(this.ctx.fs instanceof ProjectFileSystem
        ? { project_files: { protocol: 1 as const } }
        : {}),
    };
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

  configure(input: HarnessDesiredConfiguration): Promise<void> {
    return this.admission.run(() =>
      this.composition.request(input, this.sessions.size + this.opening.size),
    );
  }

  configurationStatus(): readonly HarnessPluginReadiness[] {
    return this.configuration.snapshot();
  }

  configurationState(): HarnessRuntimeConfigurationState {
    return this.composition.state();
  }

  private async open(input: HarnessSessionOptions, resume: boolean): Promise<HarnessSession> {
    this.composition.assertReady();
    const options = HARNESS_SESSION_OPTIONS.parse(input);
    if (this.sessions.has(options.sessionId) || this.opening.has(options.sessionId))
      throw new HarnessRuntimeError(
        'operation_failed',
        `Session ${options.sessionId} is already open on this host.`,
      );
    this.opening.add(options.sessionId);
    try {
      if (this.ctx.fs instanceof ProjectFileSystem)
        this.ctx.fs.scopes.bind(options.sessionId, options.storageBinding);
      this.lifecycle.serverPolicy.bind(options.sessionId, options.authority);
      await this.ctx.llm.resolveModelInfo(options.provider, options.model);
      const handle = await this.acquire(options, resume);
      const session = new HarnessSession(this.ctx, handle, this.lifecycle.interactions);
      this.sessions.set(options.sessionId, session);
      this.log.info('session.opened', { session_id: options.sessionId, resumed: resume });
      return session;
    } catch (error) {
      this.lifecycle.serverPolicy.unbind(options.sessionId);
      if (this.ctx.fs instanceof ProjectFileSystem)
        this.ctx.fs.scopes.bind(options.sessionId, undefined);
      throw error;
    } finally {
      this.opening.delete(options.sessionId);
    }
  }

  private async acquire(options: HarnessSessionOptions, resume: boolean): Promise<AgentHandle> {
    const setup = async (agentCtx: Context, agent: Agent): Promise<void> => {
      if (options.storageBinding?.kind === 'managed') installManagedImage(this.ctx, agentCtx);
      const allowed = this.lifecycle.serverPolicy.allowed(options.sessionId);
      if (allowed !== undefined) agentCtx.tools.restrict({ allow: allowed });
      await this.ctx.workingDirectory.set(agent, options.directory ?? this.host.homeDirectory);
      agentCtx.systemPrompt.context({
        name: 'smarteverything-host',
        order: 0,
        required: true,
        interpolate: false,
        text: () => this.hostContext(agent),
      });
      initializeSessionPermission(this.ctx, agent, options.permission, resume);
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

  private hostContext(agent: Agent): string {
    const binding =
      this.ctx.fs instanceof ProjectFileSystem ? this.ctx.fs.scopes.binding(agent.id) : undefined;
    if (binding !== undefined)
      return `Current execution host: ${this.host.name}. ${projectWorkspaceContext(binding, this.ctx.workingDirectory.get(agent.session))}`;
    if (this.host.target.kind === 'server')
      return `Current execution host: ${this.host.name}, central conversation host. Local server file, shell and system-control tools are unavailable. Hub actions run only with this conversation's initiating profile and trigger grants.`;
    return `Current execution host: ${this.host.name} (${JSON.stringify(this.host.target)}), ${this.host.platform}. Effective directory: ${this.ctx.workingDirectory.get(agent.session)}. Local tools execute here. Historical paths, files and processes on another host remain there and have not been transferred.`;
  }

  private restoreRevision(): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          native: this.lifecycle.generation,
          schemas: this.configuration.restoreFingerprint(),
        }),
      )
      .digest('hex');
  }

  private fingerprint(): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          base: this.lifecycle.generation,
          plugins: this.configuration.fingerprint(),
          tools: this.ctx.tools.schemas(),
        }),
      )
      .digest('hex');
  }
}

export async function createHarnessRuntime(
  options: HarnessRuntimeOptions,
): Promise<HarnessRuntime> {
  const host = HARNESS_HOST.parse(options.host);
  if (host.platform === 'windows')
    throw new HarnessRuntimeError(
      'operation_failed',
      'The current composition requires Bash; Windows PowerShell composition is not ready.',
    );
  const root = new Context();
  const fiber = bootComposition(root, host, options);
  try {
    await fiber;
    let runtime: HarnessRuntime | undefined;
    await fiber.ctx.inject(
      [
        'agents',
        'sessions',
        'sessionPersistence',
        'jobs',
        'tools',
        'workingDirectory',
        'permissionPresets',
        'sessionProjections',
        'compaction',
        'commands',
        'systemPrompt',
        'llm',
        'attachments',
      ],
      async (ctx: Context): Promise<void> => {
        runtime = await initializeRuntime(ctx, host, options, fiber.dispose);
      },
    );
    if (runtime === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Harness runtime consumer did not activate.',
      );
    return runtime;
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}
