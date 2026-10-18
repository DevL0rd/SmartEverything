import type { HarnessConnection } from '../harness/directory';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { ZodError } from 'zod';
import {
  ApiError,
  NODE_HARNESS_CONNECT,
  NODE_HARNESS_FRAME,
  NODE_HARNESS_PROTOCOL,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_FILE_CAPABILITY,
} from '@smarteverything/domain';
import type {
  ApiErrorBody,
  ComputerNodeRow,
  HarnessTransportRequest,
  AiHarnessHost,
  HubHarnessControl,
  NodeHarnessFrame,
  HubPreviewOpen,
  HubPreviewFileClose,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { HarnessService } from '../harness/service';
import type { ComputerNodeAccess } from '../computers/node-access';
import { bearerOf } from './http';
import type { RemoteHarness } from './harness-remote';
import { HarnessResidence, type ResidenceLink } from './harness-residence';
import { ComputerConnection, ComputerSockets } from './computer-socket';
import { apiErrorFor, issuesOf } from './errors';
import { withSignal } from './request-signal';
type RemoteHarnessSubscriptionsControl = RemoteHarness['subscriptions']['control'];

const CLOSE_POLICY = 1008;
export type HarnessCalls = (input: HarnessTransportRequest) => Promise<unknown>;
export interface HarnessServed {
  readonly service: HarnessService;
  readonly calls: HarnessCalls;
}
type HarnessCall = Extract<NodeHarnessFrame, { type: 'harness_call' }>;
type HarnessCallResult = Extract<HubHarnessControl, { type: 'harness_call_result' }>['result'];
class HarnessSocket extends ComputerConnection implements ResidenceLink {
  residence: HarnessResidence | null = null;
  readonly calls = new Map<string, AbortController>();
  helloed = false;
  configurationSync = false;
  subscriptionControl = false;

  constructor(
    socket: WebSocket,
    identity: ComputerNodeRow,
    readonly token: string | null,
  ) {
    super(socket, identity);
  }
  bind(
    residence: HarnessResidence,
    configurationSync: boolean,
    subscriptionControl: boolean,
  ): void {
    this.residence = residence;
    this.subscriptionControl = subscriptionControl;
    this.configurationSync = configurationSync;
    residence.attach(this);
  }
  completeHello(): void {
    this.helloed = true;
    this.greeted();
  }
  protected detach(): void {
    for (const call of this.calls.values()) call.abort('The computer socket closed.');
    this.calls.clear();
    this.residence?.detach(this);
  }
}
export class ComputerHarnessSockets extends ComputerSockets<HarnessSocket> {
  private readonly residences = new Map<string, HarnessResidence>();
  private readonly unsubscribe: () => void;
  private readonly service: HarnessService;
  private readonly calls: HarnessCalls;
  constructor(store: Store, access: ComputerNodeAccess, served: HarnessServed, log: Logger) {
    super(NODE_HARNESS_PROTOCOL, access, log);
    this.service = served.service;
    this.calls = served.calls;
    this.unsubscribe = store.feed.subscribe((change) => {
      if (change.table === 'profiles' || change.table === 'clients') this.revalidate();
    });
  }
  override revoke(deviceId: string): void {
    super.revoke(deviceId);
    this.residences.get(deviceId)?.end();
  }
  override stop(): void {
    this.unsubscribe();
    super.stop();
    for (const residence of [...this.residences.values()]) residence.end();
  }
  protected open(
    socket: WebSocket,
    identity: ComputerNodeRow,
    request: IncomingMessage,
  ): HarnessSocket {
    return new HarnessSocket(socket, identity, bearerOf(request));
  }
  protected receive(connection: HarnessSocket, value: unknown): void {
    const residence = connection.residence;
    if (residence === null) {
      this.connect(connection, connection.identity, value);
      return;
    }
    const frame = NODE_HARNESS_FRAME.parse(value);
    this.requireBinding(residence, frame);
    if (frame.type === 'harness_hello') {
      this.hello(connection, frame);
      return;
    }
    if (frame.type === 'harness_call') {
      this.call(connection, frame);
      return;
    }
    if (frame.type === 'harness_call_cancel') {
      connection.calls.get(frame.id)?.abort('The computer cancelled this call.');
      return;
    }
    if (this.receiveSupplier(connection, residence, frame)) return;
    if (frame.type === 'harness_configuration_report') {
      this.service.configuration.report(
        frame.report,
        frame.manifest,
        this.service.directory.bound(frame.device_id, frame.generation, frame.runtime_instance),
      );
      return;
    }
    if (!connection.helloed || frame.type !== 'harness_reply')
      throw new ApiError('forbidden', 'Only a greeted computer may reply to the hub.');
    residence.remote.receive(frame);
  }
  private call(connection: HarnessSocket, frame: HarnessCall): void {
    const controller = new AbortController();
    connection.calls.set(frame.id, controller);
    const { id, request } = frame;
    const binding = {
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
    };
    const startedAt = performance.now();
    withSignal(controller.signal, () => this.calls({ ...binding, request }))
      .then(
        (value): HarnessCallResult => ({ ok: true, value }),
        (cause: unknown): HarnessCallResult => ({ ok: false, error: this.failure(cause) }),
      )
      .then((result) => {
        this.log.debug('harness.call_finished', () => ({
          socketId: connection.id,
          callId: id,
          deviceId: binding.device_id,
          generation: binding.generation,
          ok: result.ok,
          errorCode: result.ok ? null : result.error.code,
          aborted: controller.signal.aborted,
          durationMs: Math.round(performance.now() - startedAt),
          replied: connection.socket.readyState === connection.socket.OPEN,
        }));
        if (connection.calls.delete(id) && connection.socket.readyState === connection.socket.OPEN)
          connection.send({ type: 'harness_call_result', ...binding, id, result });
      })
      .catch((cause: unknown) => {
        this.log.error('harness.call_reply_failed', cause);
      });
  }
  private failure(cause: unknown): ApiErrorBody['error'] {
    const known = apiErrorFor(cause);
    if (known !== null) return known.body().error;
    if (cause instanceof ZodError)
      return { code: 'invalid_request', message: `The call is not valid: ${issuesOf(cause)}.` };
    this.log.error('harness.call_crashed', cause);
    return {
      code: 'internal',
      message: 'The server failed while handling this call; see its log.',
    };
  }
  private receiveSupplier(
    connection: HarnessSocket,
    residence: HarnessResidence,
    frame: NodeHarnessFrame,
  ): boolean {
    return (
      this.receiveInference(connection, residence, frame) ||
      this.receiveSubscription(connection, residence, frame)
    );
  }
  private receiveInference(
    connection: HarnessSocket,
    residence: HarnessResidence,
    frame: NodeHarnessFrame,
  ): boolean {
    if (frame.type !== 'harness_subscription_inference_result') return false;
    if (
      !connection.helloed ||
      this.service.directory.bound(frame.device_id, frame.generation, frame.runtime_instance)
        .inference === undefined
    )
      throw new ApiError('forbidden', 'Supplier inference was not negotiated on this connection.');
    residence.remote.models.receive(frame);
    return true;
  }
  private receiveSubscription(
    connection: HarnessSocket,
    residence: HarnessResidence,
    frame: NodeHarnessFrame,
  ): boolean {
    if (
      frame.type === 'harness_subscription_status' ||
      frame.type === 'harness_subscription_failure'
    ) {
      if (!connection.subscriptionControl || !connection.helloed)
        throw new ApiError('forbidden', 'Subscription control was not negotiated on this host.');
      if (frame.type === 'harness_subscription_status') this.service.subscriptions.frame(frame);
      residence.remote.subscriptions.receive(frame);
      return true;
    }
    return false;
  }
  private requireBinding(residence: HarnessResidence, frame: NodeHarnessFrame): void {
    const { device_id, generation, runtime_instance } = residence.binding;
    if (
      frame.device_id !== device_id ||
      frame.generation !== generation ||
      frame.runtime_instance !== runtime_instance
    )
      throw new ApiError('forbidden', 'Computer frame belongs to another generation.');
  }
  private connect(connection: HarnessSocket, identity: ComputerNodeRow, value: unknown): void {
    const connect = NODE_HARNESS_CONNECT.parse(value);
    if (connect.device_id !== identity.device_id || connect.machine_id !== identity.machine_id)
      throw new ApiError('forbidden', 'Computer handshake differs from paired machine identity.');
    const residence = this.residenceFor(identity.device_id, connect.runtime_instance);
    connection.bind(
      residence,
      connect.capabilities?.includes(HARNESS_CONFIGURATION_CAPABILITY) === true,
      connect.capabilities?.includes(HARNESS_SUBSCRIPTION_CAPABILITY) === true,
    );
    this.send(connection, {
      type: 'harness_welcome',
      protocol: 1,
      ...residence.binding,
      ...(connection.configurationSync
        ? { configuration: this.service.configuration.desired() }
        : {}),
    });
  }
  private host(
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
    platform: 'linux' | 'macos',
  ): AiHarnessHost {
    return {
      target: { kind: 'device', device_id: frame.device_id },
      machine_id: connection.identity.machine_id,
      name: frame.host.name,
      online: true,
      configuration_sync: connection.configurationSync,
      platform,
      runtime_instance: frame.runtime_instance,
      connection_generation: frame.generation,
      manifest: frame.manifest,
      workspace: {
        home_directory: frame.host.home_directory,
        default_directory: null,
        available: true,
        reason: null,
      },
      unavailable_reason: null,
    };
  }
  private hello(
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): void {
    const platform = this.validateHello(connection, frame);
    const residence = this.helloResidence(connection);
    const remote = residence.remote;
    this.service.directory.register({
      host: this.host(connection, frame, platform),
      actor: { kind: 'node', id: frame.device_id },
      ...(connection.configurationSync
        ? {
            configure: (configuration: Parameters<RemoteHarness['configure']>[0]): void => {
              if (residence.attached) remote.configure(configuration);
            },
          }
        : {}),
      ...(connection.subscriptionControl
        ? {
            subscription: (
              request: Parameters<RemoteHarnessSubscriptionsControl>[0],
            ): ReturnType<RemoteHarnessSubscriptionsControl> =>
              remote.subscriptions.control(request),
          }
        : {}),
      ...this.inferencePort(frame, remote),
      ...this.previewPort(residence, frame),
      execute: (id, request) => residence.execute(id, request),
      hasSession: (id, epoch) => remote.hasSession(id, epoch),
    });
    connection.completeHello();
    this.log.info('harness.connected', remote.binding);
  }
  private helloResidence(connection: HarnessSocket): HarnessResidence {
    if (connection.residence === null)
      throw new ApiError('forbidden', 'Computer hello arrived before its connect handshake.');
    return connection.residence;
  }
  private residenceFor(deviceId: string, instance: string): HarnessResidence {
    const current = this.residences.get(deviceId);
    if (current?.binding.runtime_instance === instance) return current;
    if (current !== undefined) {
      this.log.info('harness.residence_replaced', {
        deviceId,
        previousGeneration: current.binding.generation,
        previousInstance: current.binding.runtime_instance,
        runtimeInstance: instance,
      });
    }
    current?.end();
    const residence = new HarnessResidence(
      this.service,
      { device_id: deviceId, generation: randomUUID(), runtime_instance: instance },
      this.access,
      () => {
        if (this.residences.get(deviceId) === residence) this.residences.delete(deviceId);
      },
    );
    this.residences.set(deviceId, residence);
    return residence;
  }
  private inferencePort(
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
    remote: RemoteHarness,
  ): Pick<HarnessConnection, 'inference'> {
    return frame.manifest.subscription_inference?.protocol === 1
      ? { inference: remote.models }
      : {};
  }
  private previewPort(
    residence: HarnessResidence,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): Pick<HarnessConnection, 'preview' | 'previewFileClose'> {
    if (frame.capabilities?.includes(AI_PREVIEW_CAPABILITY) !== true) return {};
    return {
      ...(frame.capabilities.includes(AI_PREVIEW_FILE_CAPABILITY)
        ? {
            previewFileClose: (control: HubPreviewFileClose): void => {
              residence.send(control);
            },
          }
        : {}),
      preview: (control: HubPreviewOpen): void => {
        residence.send(control);
      },
    };
  }
  private validateHello(
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): 'linux' | 'macos' {
    if (
      connection.helloed ||
      connection.configurationSync !==
        (frame.capabilities?.includes(HARNESS_CONFIGURATION_CAPABILITY) === true) ||
      (frame.host.platform !== 'linux' && frame.host.platform !== 'macos') ||
      connection.subscriptionControl !==
        (frame.capabilities?.includes(HARNESS_SUBSCRIPTION_CAPABILITY) === true)
    )
      throw new ApiError(
        'forbidden',
        'Only Linux/macOS computer composition accepts inbound execution; Windows is unavailable.',
      );
    return frame.host.platform;
  }
  private send(connection: HarnessSocket, frame: HubHarnessControl): void {
    connection.send(frame);
  }
  private revalidate(): void {
    for (const residence of [...this.residences.values()]) {
      try {
        residence.remote.revalidate();
      } catch (cause) {
        this.log.error('harness.access_lost', cause, { ...residence.binding });
        residence.end();
        this.connections
          .get(residence.binding.device_id)
          ?.close(CLOSE_POLICY, 'Computer authority lost');
      }
    }
  }
}
