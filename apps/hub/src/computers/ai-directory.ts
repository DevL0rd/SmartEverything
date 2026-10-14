import type { AttachedClaude, ClaudeJob, ComputerAiDirectoryEvent } from './ai-directory-types';
export type { ComputerAiDirectoryEvent } from './ai-directory-types';
import { UNAVAILABLE_CLAUDE } from './ai-unavailable';
import { claudeHostOf } from './runtime-claude-host';
import { startClaudeTurn, startClaudeCommand, claudeProviderEvent } from './ai-directory-provider';
import { ComputerRuntimePorts } from './runtime-ports';
import { adaptClaudeHost } from './runtime-host';
import { AI_NATIVE_COMMAND_PRIVATE_OPERATION } from '@smarteverything/domain';
import type { ComputerRuntimeHost } from './runtime-host';
import type { ComputerRuntimeTarget } from '@smarteverything/domain';
import { isDeepStrictEqual } from 'node:util';
import {
  ApiError,
  COMPUTER_AI_CAPABILITIES,
  COMPUTER_AI_REPLY,
  COMPUTER_AI_SETTINGS,
  type ComputerAiRequest,
  type ComputerAiStatus,
  type ComputerAiSettingsPatch,
  type ComputerAiModel,
  type ProviderTurn,
  type CodexCommandConfiguration,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type ProviderEvent,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { Store } from '../store/store';
import type { ComputerAiHost, ComputerAiHostEvent } from './ai-host';
import { isRead, assertEnabled, assertOperation, assertReply } from './ai-access';
import { NativeReceipts, type NativeReceiptRequest } from './native-receipts';
import { roleOfCaller, profileIdOf, type Caller } from '../server/auth';

export class ComputerAiDirectory extends ComputerRuntimePorts {
  private readonly hosts = new Map<string, AttachedClaude>();
  private readonly receipts = new NativeReceipts<AttachedClaude>();
  private readonly changes = new Set<(status: ComputerAiStatus) => void>();
  private readonly jobs = new Map<string, ClaudeJob>();
  private readonly listeners = new Set<(event: ComputerAiDirectoryEvent) => void>();
  private localDeviceId: string | null = null;
  private localFactory: ((deviceId: string) => ComputerAiHost) | null = null;

  constructor(
    private readonly store: Store,
    private readonly log: Logger,
  ) {
    super(store, log);
  }

  attachRuntime(
    target: ComputerRuntimeTarget,
    host: ComputerRuntimeHost,
    local: boolean,
  ): () => void {
    return target.runtime === 'claude'
      ? this.attach(target.device_id, claudeHostOf(host), local)
      : this.runtimes.attach(target, host, local);
  }
  setLocalFactory(factory: (deviceId: string) => ComputerAiHost): void {
    this.localFactory = factory;
    this.attachLocal();
  }

  bindLocalDevice(deviceId: string): void {
    if (this.localDeviceId !== null && this.localDeviceId !== deviceId) {
      throw new ApiError(
        'conflict',
        'The local computer identity changed while the hub was running.',
      );
    }
    this.localDeviceId = deviceId;
    this.runtimes.bindLocalDevice(deviceId);
    this.store.computerAi.initialiseLocal(
      deviceId,
      this.store.assistantChat.settings().claude_link_auto,
    );
    this.attachLocal();
  }

  attach(deviceId: string, host: ComputerAiHost, local: boolean): () => void {
    this.computer(deviceId);
    this.detach(deviceId);
    this.store.computerAi.cache(
      deviceId,
      UNAVAILABLE_CLAUDE,
      this.store.computerAi.models(deviceId),
    );
    let leave = (): void => undefined;
    const attached = {
      deviceId,
      host,
      local,
      leave: (): void => {
        leave();
      },
    };
    this.hosts.set(deviceId, attached);
    this.runtimes.attach(
      { device_id: deviceId, runtime: 'claude' },
      adaptClaudeHost(host),
      local,
      false,
    );
    leave = host.onEvent((event) => {
      this.received(deviceId, event, attached);
    });
    this.changed(deviceId);
    return (): void => {
      if (this.hosts.get(deviceId) === attached) this.detach(deviceId);
    };
  }

  status(deviceId: string): ComputerAiStatus {
    this.computer(deviceId);
    const host = this.hosts.get(deviceId);
    return {
      device_id: deviceId,
      local: host?.local === true || this.localDeviceId === deviceId,
      online: host !== undefined,
      settings: this.store.computerAi.settings(deviceId),
      capabilities: this.store.computerAi.capabilities(deviceId) ?? UNAVAILABLE_CLAUDE,
    };
  }

  async update(deviceId: string, patch: ComputerAiSettingsPatch): Promise<ComputerAiStatus> {
    this.computer(deviceId);
    this.store.computerNativeMcpPolicy.denyLegacy(
      { device_id: deviceId, runtime: 'claude' },
      patch.control,
    );
    const previous = this.store.computerAi.settings(deviceId);
    const settings = COMPUTER_AI_SETTINGS.parse({
      control: { ...previous.control, ...patch.control },
      provider: { ...previous.provider, ...patch.provider },
    });
    const attached = this.hosts.get(deviceId);
    if (attached !== undefined) {
      const reply = COMPUTER_AI_REPLY.parse(
        await attached.host.execute({ operation: 'configure', settings }),
      );
      if (reply.operation !== 'configure')
        throw new ApiError(
          'upstream_failed',
          'The computer returned a different operation for configure.',
        );
    }
    this.store.computerAi.saveSettings(deviceId, settings);
    this.changed(deviceId);
    return this.status(deviceId);
  }

  async request<T>(deviceId: string, request: ComputerAiRequest, schema: z.ZodType<T>): Promise<T> {
    if (request.operation === 'native_operation')
      throw new ApiError(
        'forbidden',
        'Read native receipts through their exact owner-bound route.',
      );
    return this.send(this.available(deviceId, request), request, schema);
  }

  async nativeRequest<T>(
    deviceId: string,
    request: NativeReceiptRequest,
    schema: z.ZodType<T>,
    caller: Caller,
  ): Promise<T> {
    if (caller.kind !== 'client' || roleOfCaller(caller) !== 'owner')
      throw new ApiError(
        'forbidden',
        'Only the owner may submit or read native operation receipts.',
      );
    const owner = { profileId: profileIdOf(this.store, caller), clientId: caller.client.id };
    let attached: AttachedClaude;
    if (request.operation === 'native_operation') {
      attached = this.receipts.authorize(
        deviceId,
        owner,
        request.operation_id,
        this.hosts.get(deviceId),
      );
      const status = this.status(deviceId);
      assertOperation(status, request, false);
    } else {
      attached = this.available(deviceId, request);
      this.receipts.accept(deviceId, owner, request, attached);
    }
    const result = await this.send(attached, request, schema);
    if (request.operation === 'native_operation')
      this.receipts.authorize(deviceId, owner, request.operation_id, this.hosts.get(deviceId));
    return result;
  }

  private async send<T>(
    attached: AttachedClaude,
    request: ComputerAiRequest,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const reply = COMPUTER_AI_REPLY.parse(
      await (isRead(request) ? attached.host.read(request) : attached.host.execute(request)),
    );
    assertReply(request, reply);
    if (this.hosts.get(attached.deviceId) !== attached)
      throw new ApiError(
        'conflict',
        'The selected Claude attachment changed before confirming its reply.',
      );
    const result = schema.parse(reply.value);
    if (request.operation === 'provider_control') {
      const job = this.jobs.get(request.job_id);
      if (
        request.control.action === 'close' ||
        (request.control.action === 'delete_session' &&
          request.control.session_id === job?.sessionId)
      )
        this.jobs.delete(request.job_id);
    }
    return result;
  }

  async models(deviceId: string): Promise<ComputerAiModel[]> {
    const status = this.status(deviceId);
    if (!status.online || !status.settings.provider.enabled) {
      const reason = !status.online
        ? 'The supplying computer is offline.'
        : 'The provider is disabled on this computer.';
      return this.store.computerAi
        .models(deviceId)
        .map((model) => ({ ...model, available: false, reason }));
    }
    const attached = this.available(deviceId, { operation: 'models' });
    const reply = COMPUTER_AI_REPLY.parse(await attached.host.read({ operation: 'models' }));
    if (this.hosts.get(deviceId) !== attached)
      throw new ApiError('conflict', 'The supplying computer changed during model discovery.');
    if (reply.operation !== 'models' || reply.value.some((model) => model.device_id !== deviceId))
      throw new ApiError(
        'upstream_failed',
        'The computer returned models with an invalid machine binding.',
      );
    this.store.computerAi.cache(deviceId, this.status(deviceId).capabilities, reply.value);
    this.changed(deviceId);
    return reply.value;
  }

  startTurn(turn: ProviderTurn): ReturnType<typeof startClaudeTurn> {
    this.available(turn.device_id, { operation: 'provider_start', turn });
    return startClaudeTurn(this.jobs, this.runtimes, turn);
  }
  override startRuntimeCommand(
    input: AiNativeCommandWrite,
    authorize: () => void,
    configuration?: CodexCommandConfiguration,
  ): Promise<AiNativeCommandReceipt> {
    return startClaudeCommand(this.jobs, this.runtimes, {
      input,
      authorize,
      ...(configuration === undefined ? {} : { configuration }),
    });
  }

  onChange(listener: (status: ComputerAiStatus) => void): () => void {
    this.changes.add(listener);
    return (): void => {
      this.changes.delete(listener);
    };
  }

  onEvent(listener: (event: ComputerAiDirectoryEvent) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  stop(): void {
    for (const deviceId of this.hosts.keys()) this.detach(deviceId);
    this.runtimes.stop();
    this.localFactory = null;
    this.listeners.clear();
    this.changes.clear();
  }

  private attachLocal(): void {
    const { localDeviceId, localFactory } = this;
    if (localDeviceId === null || localFactory === null || this.hosts.has(localDeviceId)) return;
    const host = localFactory(localDeviceId);
    this.attach(localDeviceId, host, true);
    host
      .execute({ operation: 'configure', settings: this.store.computerAi.settings(localDeviceId) })
      .catch((cause: unknown) => {
        this.log.error('computer.local_configure_failed', cause);
      });
  }

  private available(deviceId: string, request: ComputerAiRequest): AttachedClaude {
    if (AI_NATIVE_COMMAND_PRIVATE_OPERATION.safeParse(request.operation).success)
      throw new ApiError(
        'forbidden',
        'Native commands require their dedicated caller-bound admission route.',
      );
    const status = this.status(deviceId);
    const provider = request.operation.startsWith('provider_') || request.operation === 'models';
    assertEnabled(status, request, provider);
    const attached = this.hosts.get(deviceId);
    if (attached === undefined)
      throw new ApiError(
        'claude_not_ready',
        'The selected computer is offline; choose or reconnect that computer.',
      );
    assertOperation(status, request, provider);
    this.validateJob(deviceId, request);
    return attached;
  }

  private validateJob(deviceId: string, request: ComputerAiRequest): void {
    const jobId = 'job_id' in request ? request.job_id : undefined;
    if (jobId === undefined) return;
    if (this.jobs.get(jobId)?.deviceId !== deviceId)
      throw new ApiError(
        'not_found',
        'This provider job does not belong to the selected computer.',
      );
  }

  private received(deviceId: string, event: ComputerAiHostEvent, source?: AttachedClaude): void {
    if (source !== undefined && this.hosts.get(deviceId) !== source) return;
    if (
      event.kind === 'capabilities' &&
      isDeepStrictEqual(this.store.computerAi.capabilities(deviceId), event.capabilities)
    )
      return;
    if (event.kind === 'capabilities')
      this.store.computerAi.cache(
        deviceId,
        COMPUTER_AI_CAPABILITIES.parse(event.capabilities),
        this.store.computerAi.models(deviceId),
      );
    if (event.kind === 'capabilities') this.changed(deviceId);
    if (event.kind === 'provider' && !this.providerEvent(deviceId, event.event)) return;
    this.publish(deviceId, event, source);
  }

  private publish(
    deviceId: string,
    event: ComputerAiHostEvent,
    source: AttachedClaude | undefined,
  ): void {
    if (event.kind === 'native' && event.notice.type === 'claude_operation') {
      if (source === undefined || this.hosts.get(deviceId) !== source) return;
      const profileId = this.receipts.profile(event.notice.operation.id, deviceId, source);
      if (profileId === null) return;
      for (const listener of this.listeners) listener({ deviceId, profileId, event });
      return;
    }
    for (const listener of this.listeners) listener({ deviceId, event });
  }

  private providerEvent(deviceId: string, event: ProviderEvent): boolean {
    return claudeProviderEvent(this.jobs, deviceId, event);
  }

  private detach(deviceId: string): void {
    const attached = this.hosts.get(deviceId);
    if (attached === undefined) return;
    this.hosts.delete(deviceId);
    this.runtimes.detach({ device_id: deviceId, runtime: 'claude' }, false);
    attached.leave();
    attached.host.stop();
    this.changed(deviceId);
    for (const [jobId, job] of this.jobs) {
      if (job.deviceId !== deviceId) continue;
      this.received(deviceId, {
        kind: 'provider',
        event: {
          kind: 'failed',
          job_id: jobId,
          chat_id: job.chatId,
          seq: job.seq + 1,
          code: 'computer_disconnected',
          message: 'The supplying computer disconnected; the job was not resubmitted.',
        },
      });
    }
  }

  changed(deviceId: string): void {
    if (this.store.devices.find(deviceId) === undefined) return;
    const status = this.status(deviceId);
    for (const listener of this.changes) listener(status);
  }

  private computer(deviceId: string): void {
    if (this.store.devices.byId(deviceId).kind !== 'computer')
      throw new ApiError(
        'invalid_request',
        'Claude computer operations require a computer device.',
      );
  }
}
