import { randomUUID } from 'node:crypto';
import {
  startRuntimeCommand,
  assertRuntimeCommandAvailable,
  type CommandDirectory,
  type NativeCommandAdmission,
  type NativeCommandStart,
} from './runtime-command-admission';
import { runtimeProviderProfile, nativeRuntimeProfile } from './runtime-provider-events';
import type {
  AttachedRuntime,
  RuntimeJob,
  ComputerRuntimeDirectoryEvent,
} from './runtime-directory-types';
export type { ComputerRuntimeDirectoryEvent } from './runtime-directory-types';
import { unavailableRuntime, runtimeTargetOfKey } from './runtime-status';
import {
  ApiError,
  COMPUTER_RUNTIME_REPLY,
  COMPUTER_RUNTIME_CAPABILITIES,
  COMPUTER_RUNTIME_REQUEST,
  COMPUTER_RUNTIME_SETTINGS,
  computerRuntimeKey,
  PROVIDER_TURN_MAX_BYTES,
  type ComputerAiRuntime,
  type ComputerRuntimeTarget,
  type ComputerRuntimeSettingsPatch,
  type ComputerRuntimeStatus,
  type ComputerRuntimeRequest,
  type ComputerRuntimeModel,
  type ComputerRuntimeProviderTurn,
  type ComputerRuntimeReply,
  type AiNativeCommandWrite,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { ComputerRuntimeHost, ComputerRuntimeHostEvent } from './runtime-host';
import {
  assertRuntimeAvailable,
  assertPublicRuntimeRequest,
  assertNativeEffectsReconciled,
  assertRuntimeReply,
  isRuntimeRead,
  runtimeAccessEnabled,
} from './runtime-access';
import { RuntimeReceipts } from './runtime-receipts';
import { attachmentGeneration, runtimeDirectoryStatus } from './runtime-directory-status';
type RuntimeFactory = (deviceId: string) => ComputerRuntimeHost;
export class ComputerRuntimeDirectory {
  private readonly hosts = new Map<string, AttachedRuntime>();
  private readonly factories = new Map<ComputerAiRuntime, RuntimeFactory>();
  private readonly changes = new Set<(status: ComputerRuntimeStatus) => void>();
  private readonly listeners = new Set<(event: ComputerRuntimeDirectoryEvent) => void>();
  private readonly jobs = new Map<string, RuntimeJob>();
  private readonly receipts = new RuntimeReceipts<AttachedRuntime>();
  private localDeviceId: string | null = null;
  constructor(
    private readonly store: Store,
    private readonly log: Logger,
  ) {}
  setLocalFactory(
    runtime: ComputerAiRuntime,
    factory: (deviceId: string) => ComputerRuntimeHost,
  ): void {
    if (this.factories.has(runtime))
      throw new ApiError('conflict', `The local ${runtime} factory is already registered.`);
    this.factories.set(runtime, factory);
    this.attachLocal(runtime);
  }
  bindLocalDevice(deviceId: string): void {
    if (this.localDeviceId !== null && this.localDeviceId !== deviceId)
      throw new ApiError('conflict', 'Local runtime computer identity changed.');
    this.localDeviceId = deviceId;
    for (const runtime of this.factories.keys()) this.attachLocal(runtime);
  }
  attach(
    target: ComputerRuntimeTarget,
    host: ComputerRuntimeHost,
    local: boolean,
    owned = true,
  ): () => void {
    this.computer(target);
    if (host.runtime !== target.runtime)
      throw new ApiError('invalid_request', 'Runtime host and attachment target must agree.');
    this.detach(target);
    const attached: AttachedRuntime = {
      host,
      local,
      capabilities: null,
      connectionGeneration: randomUUID(),
      leave: (): void => undefined,
    };
    this.hosts.set(computerRuntimeKey(target), attached);
    attached.leave = host.onEvent((event) => {
      this.received(target, event, attached);
    });
    const detach = (): void => {
      if (this.hosts.get(computerRuntimeKey(target)) === attached) this.detach(target, owned);
    };
    this.store.computerRuntimes.cache(
      target,
      unavailableRuntime(target.runtime),
      this.store.computerRuntimes.models(target),
    );
    this.changed(target);
    return detach;
  }
  connectionGeneration(target: ComputerRuntimeTarget): string {
    return attachmentGeneration(this.hosts.get(computerRuntimeKey(target)));
  }
  status(target: ComputerRuntimeTarget): ComputerRuntimeStatus {
    this.computer(target);
    return runtimeDirectoryStatus(
      { store: this.store, localDeviceId: this.localDeviceId },
      target,
      this.hosts.get(computerRuntimeKey(target)),
    );
  }
  async update(
    target: ComputerRuntimeTarget,
    patch: ComputerRuntimeSettingsPatch,
  ): Promise<ComputerRuntimeStatus> {
    this.computer(target);
    if (patch.runtime !== target.runtime)
      throw new ApiError('invalid_request', 'Runtime patch and path must agree.');
    this.store.computerNativeMcpPolicy.denyLegacy(target, patch.settings.control);
    const previous = this.store.computerRuntimes.settings(target);
    const settings = COMPUTER_RUNTIME_SETTINGS.parse({
      runtime: target.runtime,
      settings: {
        control: { ...previous.settings.control, ...patch.settings.control },
        provider: { ...previous.settings.provider, ...patch.settings.provider },
      },
    });
    const attached = this.hosts.get(computerRuntimeKey(target));
    const request = COMPUTER_RUNTIME_REQUEST.parse({
      runtime: target.runtime,
      request: { operation: 'configure', settings: settings.settings },
    });
    if (attached !== undefined) await this.send(target, attached, request, COMPUTER_RUNTIME_REPLY);
    this.store.computerRuntimes.saveSettings(target, settings);
    this.changed(target);
    return this.status(target);
  }
  async request<T>(
    target: ComputerRuntimeTarget,
    input: ComputerRuntimeRequest,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const request = COMPUTER_RUNTIME_REQUEST.parse(input);
    if (
      request.request.operation === 'provider_command' ||
      request.request.operation === 'provider_command_dispatch'
    )
      assertPublicRuntimeRequest(request);
    if (request.request.operation === 'native_operation')
      throw new ApiError('forbidden', 'Read native receipts through their owner-bound route.');
    return this.send(target, this.available(target, request), request, schema);
  }
  async nativeRequest<T>(
    target: ComputerRuntimeTarget,
    input: ComputerRuntimeRequest,
    schema: z.ZodType<T>,
    caller: Caller,
  ): Promise<T> {
    if (caller.kind !== 'client' || roleOfCaller(caller) !== 'owner')
      throw new ApiError(
        'forbidden',
        'Only the owner can submit and read native runtime receipts.',
      );
    const request = COMPUTER_RUNTIME_REQUEST.parse(input);
    assertPublicRuntimeRequest(request);
    if (request.runtime !== target.runtime)
      throw new ApiError('invalid_request', 'Runtime request and path must agree.');
    assertNativeEffectsReconciled(this.store, target, request);
    const profileId = profileIdOf(this.store, caller);
    const owner = { profileId, clientId: caller.client.id };
    const current = this.hosts.get(computerRuntimeKey(target));
    let attached: AttachedRuntime;
    if (request.request.operation === 'native_operation')
      attached = this.receipts.authorize(target, owner, request.request.operation_id, current);
    else {
      if (isRuntimeRead(request))
        throw new ApiError('invalid_request', 'Native receipt route requires a mutation.');
      attached = this.available(target, request);
      this.receipts.accept(target, owner, request, attached);
    }
    const result = await this.send(target, attached, request, schema);
    if (request.request.operation === 'native_operation')
      this.receipts.authorize(
        target,
        owner,
        request.request.operation_id,
        this.hosts.get(computerRuntimeKey(target)),
      );
    return result;
  }
  async models(target: ComputerRuntimeTarget): Promise<ComputerRuntimeModel[]> {
    const status = this.status(target);
    if (!status.online || !runtimeAccessEnabled(status, 'models'))
      return this.store.computerRuntimes.models(target).map((model) => ({
        ...model,
        available: false,
        reason: status.online
          ? 'The selected runtime model discovery is disabled.'
          : 'The supplying computer runtime is offline.',
      }));
    const request = COMPUTER_RUNTIME_REQUEST.parse({
      runtime: target.runtime,
      request: { operation: 'models' },
    });
    const reply = await this.request(target, request, COMPUTER_RUNTIME_REPLY);
    if (reply.reply.operation !== 'models')
      throw new ApiError('upstream_failed', 'Expected runtime model discovery reply.');
    const models =
      reply.runtime === 'claude'
        ? reply.reply.value.map((model) => ({
            ...model,
            runtime: target.runtime,
            input_modalities: [],
          }))
        : reply.reply.value;
    const parsed = models.map((model) => {
      if (model.device_id !== target.device_id || model.runtime !== target.runtime)
        throw new ApiError(
          'upstream_failed',
          'Discovered model belongs to another computer runtime.',
        );
      return model;
    });
    this.store.computerRuntimes.cache(target, this.status(target).capabilities, parsed);
    this.changed(target);
    return parsed;
  }
  async startTurn(input: ComputerRuntimeProviderTurn): Promise<ComputerRuntimeReply> {
    const target: ComputerRuntimeTarget = {
      device_id: input.turn.device_id,
      runtime: input.runtime,
    };
    const request = COMPUTER_RUNTIME_REQUEST.parse({
      runtime: input.runtime,
      request: { operation: 'provider_start', turn: input.turn },
    });
    if (Buffer.byteLength(JSON.stringify(input.turn), 'utf8') > PROVIDER_TURN_MAX_BYTES)
      throw new ApiError(
        'invalid_request',
        'Runtime provider turn exceeds the 32 MiB transport limit.',
      );
    const key = JSON.stringify([target.device_id, target.runtime, input.turn.job_id]);
    if (this.jobs.has(key))
      throw new ApiError('conflict', 'This runtime provider job was already submitted.');
    const source = this.available(target, request);
    this.jobs.set(key, {
      target,
      chatId: input.turn.chat_id,
      profileId: input.turn.profile_id,
      source,
      seq: 0,
      processGeneration: null,
    });
    const reply = await this.send(target, source, request, COMPUTER_RUNTIME_REPLY);
    if (
      reply.reply.operation !== 'provider_start' ||
      reply.reply.value.job_id !== input.turn.job_id
    )
      throw new ApiError('upstream_failed', 'Runtime returned a different provider job.');
    return reply;
  }
  assertCommandAvailable(input: AiNativeCommandWrite): void {
    assertRuntimeCommandAvailable(this.commandPorts(), input);
  }
  startCommand(...input: NativeCommandStart): NativeCommandAdmission {
    return startRuntimeCommand(this.commandPorts(), ...input);
  }
  private readonly commandPorts = (): CommandDirectory => ({
    jobs: this.jobs,
    available: (target, request) => this.available(target, request),
    send: (target, source, request) => this.send(target, source, request, COMPUTER_RUNTIME_REPLY),
  });
  onChange(listener: (status: ComputerRuntimeStatus) => void): () => void {
    this.changes.add(listener);
    return (): void => {
      this.changes.delete(listener);
    };
  }
  onEvent(listener: (event: ComputerRuntimeDirectoryEvent) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  detach(target: ComputerRuntimeTarget, owned = true): void {
    const key = computerRuntimeKey(target);
    const attached = this.hosts.get(key);
    if (attached === undefined) return;
    this.hosts.delete(key);
    attached.leave();
    if (owned) attached.host.stop();
    for (const [id, job] of this.jobs) if (job.source === attached) this.jobs.delete(id);
    this.changed(target);
  }
  stop(): void {
    for (const [key] of this.hosts) {
      const target = runtimeTargetOfKey(key);
      this.detach(target);
    }
    this.factories.clear();
    this.listeners.clear();
    this.changes.clear();
  }
  private available(
    target: ComputerRuntimeTarget,
    request: ComputerRuntimeRequest,
  ): AttachedRuntime {
    assertRuntimeAvailable(this.status(target), request);
    const attached = this.hosts.get(computerRuntimeKey(target));
    if (attached === undefined)
      throw new ApiError('claude_not_ready', 'Selected runtime is offline.');
    if ('job_id' in request.request && request.request.job_id !== undefined) {
      const job = this.jobs.get(
        JSON.stringify([target.device_id, target.runtime, request.request.job_id]),
      );
      if (job?.source !== attached)
        throw new ApiError('not_found', 'This provider job belongs to another runtime attachment.');
    }
    return attached;
  }
  private async send<T>(
    target: ComputerRuntimeTarget,
    attached: AttachedRuntime,
    request: ComputerRuntimeRequest,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const reply = COMPUTER_RUNTIME_REPLY.parse(
      await (isRuntimeRead(request) ? attached.host.read(request) : attached.host.execute(request)),
    );
    assertRuntimeReply(request, reply);
    if (this.hosts.get(computerRuntimeKey(target)) !== attached)
      throw new ApiError('conflict', 'The selected runtime attachment changed before its reply.');
    return schema.parse(reply);
  }
  private received(
    target: ComputerRuntimeTarget,
    event: ComputerRuntimeHostEvent,
    source: AttachedRuntime,
  ): void {
    const attached = this.hosts.get(computerRuntimeKey(target));
    if (attached !== source || event.runtime !== target.runtime) return;
    if (event.kind === 'capabilities') {
      attached.capabilities = COMPUTER_RUNTIME_CAPABILITIES.parse(event.capabilities);
      this.store.computerRuntimes.cache(
        target,
        event.capabilities,
        this.store.computerRuntimes.models(target),
      );
      this.changed(target);
    }
    const profileId =
      event.kind === 'provider'
        ? runtimeProviderProfile(this.jobs, target, event, source)
        : nativeRuntimeProfile(this.receipts, target, event, source);
    if (profileId === null) return;
    for (const listener of this.listeners)
      listener(profileId === undefined ? { target, event } : { target, event, profileId });
  }
  private attachLocal(runtime: ComputerAiRuntime): void {
    const factory = this.factories.get(runtime);
    const deviceId = this.localDeviceId;
    if (deviceId === null || factory === undefined) return;
    const target = { device_id: deviceId, runtime };
    if (this.hosts.has(computerRuntimeKey(target))) return;
    const host = factory(deviceId);
    this.attach(target, host, true);
    const request = COMPUTER_RUNTIME_REQUEST.parse({
      runtime,
      request: {
        operation: 'configure',
        settings: this.store.computerRuntimes.settings(target).settings,
      },
    });
    if (isRuntimeRead(request))
      throw new ApiError('internal', 'Configure must be a runtime mutation.');
    host.execute(request).catch((cause: unknown) => {
      this.log.error('computer.runtime_configure_failed', cause, { runtime, deviceId });
    });
  }
  changed(target: ComputerRuntimeTarget): void {
    if (this.store.devices.find(target.device_id) === undefined) return;
    const status = this.status(target);
    for (const listener of this.changes) listener(status);
  }
  private computer(target: ComputerRuntimeTarget): void {
    if (this.store.devices.byId(target.device_id).kind !== 'computer')
      throw new ApiError('invalid_request', 'Runtime operations require a computer device.');
  }
}
