import type { HarnessConnection } from '../harness/directory';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import {
  ApiError,
  NODE_HARNESS_CONNECT,
  NODE_HARNESS_FRAME,
  NODE_HARNESS_PROTOCOL,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_FILE_CAPABILITY,
  SUBSCRIPTION_INFERENCE_MAX_BYTES,
} from '@smarteverything/domain';
import type {
  ComputerNodeRow,
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
import { RemoteHarness } from './harness-remote';
type RemoteHarnessSubscriptionsControl = RemoteHarness['subscriptions']['control'];

const HELLO_TIMEOUT_MS = 30_000;
const HEARTBEAT_MS = 30_000;
class HarnessSocket {
  readonly generation = randomUUID();
  instance: string | null = null;
  remote: RemoteHarness | null = null;
  alive = true;
  configurationSync = false;
  subscriptionControl = false;
  readonly timer: NodeJS.Timeout;
  constructor(
    readonly socket: WebSocket,
    readonly identity: ComputerNodeRow,
    readonly token: string | null,
  ) {
    this.timer = setTimeout(() => {
      socket.terminate();
    }, HELLO_TIMEOUT_MS);
  }
  bind(instance: string, configurationSync: boolean, subscriptionControl: boolean): void {
    this.subscriptionControl = subscriptionControl;
    this.instance = instance;
    this.configurationSync = configurationSync;
  }
  attach(remote: RemoteHarness): void {
    this.remote = remote;
  }
  stop(): void {
    clearTimeout(this.timer);
    this.remote?.stop();
    this.socket.terminate();
  }
}
export class ComputerHarnessSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: SUBSCRIPTION_INFERENCE_MAX_BYTES,
    handleProtocols: (protocols): string | false =>
      protocols.has(NODE_HARNESS_PROTOCOL) ? NODE_HARNESS_PROTOCOL : false,
  });
  private readonly sockets = new Set<HarnessSocket>();
  private readonly connections = new Map<string, HarnessSocket>();
  private checking = false;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly unsubscribe: () => void;
  constructor(
    store: Store,
    private readonly access: ComputerNodeAccess,
    private readonly service: HarnessService,
    private readonly log: Logger,
  ) {
    this.heartbeat = setInterval(() => {
      this.beat();
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
    this.unsubscribe = store.feed.subscribe(() => {
      this.reauthenticate();
    });
  }
  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const protocols = request.headers['sec-websocket-protocol'];
    if (
      typeof protocols !== 'string' ||
      !protocols
        .split(',')
        .map((value) => value.trim())
        .includes(NODE_HARNESS_PROTOCOL)
    )
      throw new ApiError('invalid_request', 'Computer harness requires its versioned subprotocol.');
    const token = bearerOf(request);
    const identity = this.access.authenticate(token);
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(ws, identity, token);
    });
  }
  revoke(deviceId: string): void {
    this.connections.get(deviceId)?.stop();
  }
  stop(): void {
    this.unsubscribe();
    clearInterval(this.heartbeat);
    for (const connection of this.sockets) connection.stop();
    this.connections.clear();
    this.sockets.clear();
    this.server.close();
  }
  private accept(socket: WebSocket, identity: ComputerNodeRow, token: string | null): void {
    const connection = new HarnessSocket(socket, identity, token);
    this.sockets.add(connection);
    socket.on('message', (raw: RawData, binary) => {
      try {
        if (binary) throw new ApiError('invalid_request', 'Harness frames require JSON text.');
        this.received(connection, frameText(raw));
      } catch (cause) {
        this.log.error('harness.frame_rejected', cause, { device_id: identity.device_id });
        connection.stop();
      }
    });
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('error', (cause) => {
      this.log.error('harness.socket_failed', cause, { device_id: identity.device_id });
    });
    socket.on('close', () => {
      this.sockets.delete(connection);
      connection.stop();
      if (this.connections.get(identity.device_id) === connection)
        this.connections.delete(identity.device_id);
    });
  }
  private received(connection: HarnessSocket, text: string): void {
    const identity = this.access.authenticate(connection.token);
    if (
      identity.machine_id !== connection.identity.machine_id ||
      identity.device_id !== connection.identity.device_id
    )
      throw new ApiError('forbidden', 'Computer pairing identity changed.');
    const value: unknown = JSON.parse(text);
    if (connection.instance === null) {
      this.connect(connection, identity, value);
      return;
    }
    if (this.connections.get(identity.device_id) !== connection)
      throw new ApiError('forbidden', 'Computer connection has been replaced.');
    const frame = NODE_HARNESS_FRAME.parse(value);
    this.requireBinding(connection, frame);
    if (frame.type === 'harness_hello') {
      this.hello(connection, frame);
      return;
    }
    if (this.receiveSupplier(connection, frame)) return;
    if (frame.type === 'harness_configuration_report') {
      this.service.configuration.report(
        frame.report,
        frame.manifest,
        this.service.directory.bound(frame.device_id, frame.generation, frame.runtime_instance),
      );
      return;
    }
    if (connection.remote === null || frame.type !== 'harness_reply')
      throw new ApiError(
        'forbidden',
        'Native projections use the canonical HTTP persistence transport after hello.',
      );
    connection.remote.receive(frame);
  }
  private receiveSupplier(connection: HarnessSocket, frame: NodeHarnessFrame): boolean {
    return this.receiveInference(connection, frame) || this.receiveSubscription(connection, frame);
  }
  private receiveInference(connection: HarnessSocket, frame: NodeHarnessFrame): boolean {
    if (frame.type !== 'harness_subscription_inference_result') return false;
    if (
      connection.remote === null ||
      this.service.directory.bound(frame.device_id, frame.generation, frame.runtime_instance)
        .inference === undefined
    )
      throw new ApiError('forbidden', 'Supplier inference was not negotiated on this connection.');
    connection.remote.models.receive(frame);
    return true;
  }
  private receiveSubscription(connection: HarnessSocket, frame: NodeHarnessFrame): boolean {
    if (
      frame.type === 'harness_subscription_status' ||
      frame.type === 'harness_subscription_failure'
    ) {
      if (!connection.subscriptionControl || connection.remote === null)
        throw new ApiError('forbidden', 'Subscription control was not negotiated on this host.');
      if (frame.type === 'harness_subscription_status') this.service.subscriptions.frame(frame);
      connection.remote.subscriptions.receive(frame);
      return true;
    }
    return false;
  }
  private requireBinding(connection: HarnessSocket, frame: NodeHarnessFrame): void {
    if (
      frame.device_id !== connection.identity.device_id ||
      frame.generation !== connection.generation ||
      frame.runtime_instance !== connection.instance
    )
      throw new ApiError('forbidden', 'Computer frame belongs to another generation.');
  }
  private connect(connection: HarnessSocket, identity: ComputerNodeRow, value: unknown): void {
    const connect = NODE_HARNESS_CONNECT.parse(value);
    if (connect.device_id !== identity.device_id || connect.machine_id !== identity.machine_id)
      throw new ApiError('forbidden', 'Computer handshake differs from paired machine identity.');
    connection.bind(
      connect.runtime_instance,
      connect.capabilities?.includes(HARNESS_CONFIGURATION_CAPABILITY) === true,
      connect.capabilities?.includes(HARNESS_SUBSCRIPTION_CAPABILITY) === true,
    );
    this.connections.get(identity.device_id)?.stop();
    this.connections.set(identity.device_id, connection);
    this.send(connection, {
      type: 'harness_welcome',
      protocol: 1,
      device_id: identity.device_id,
      generation: connection.generation,
      runtime_instance: connect.runtime_instance,
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
      inbound_execution: true,
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
    const remote = this.remote(connection, frame);
    connection.attach(remote);
    this.service.directory.register({
      host: this.host(connection, frame, platform),
      actor: { kind: 'node', id: frame.device_id },
      ...(connection.configurationSync
        ? {
            configure: (configuration: Parameters<RemoteHarness['configure']>[0]): void => {
              remote.configure(configuration);
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
      ...this.previewPort(connection, frame),
      execute: (id, request) => remote.execute(id, request),
      hasSession: (id, epoch) => remote.hasSession(id, epoch),
    });
    clearTimeout(connection.timer);
    this.log.info('harness.connected', remote.binding);
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
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): Pick<HarnessConnection, 'preview' | 'previewFileClose'> {
    if (frame.capabilities?.includes(AI_PREVIEW_CAPABILITY) !== true) return {};
    return {
      ...(frame.capabilities.includes(AI_PREVIEW_FILE_CAPABILITY)
        ? {
            previewFileClose: (control: HubPreviewFileClose): void => {
              this.access.authenticate(connection.token);
              this.send(connection, control);
            },
          }
        : {}),
      preview: (control: HubPreviewOpen): void => {
        this.access.authenticate(connection.token);
        this.send(connection, control);
      },
    };
  }
  private validateHello(
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): 'linux' | 'macos' {
    if (
      connection.remote !== null ||
      connection.configurationSync !==
        (frame.capabilities?.includes(HARNESS_CONFIGURATION_CAPABILITY) === true) ||
      (frame.host.platform !== 'linux' && frame.host.platform !== 'macos') ||
      !frame.host.inbound_execution ||
      connection.subscriptionControl !==
        (frame.capabilities?.includes(HARNESS_SUBSCRIPTION_CAPABILITY) === true)
    )
      throw new ApiError(
        'forbidden',
        'Only Linux/macOS computer composition accepts inbound execution; Windows is unavailable.',
      );
    return frame.host.platform;
  }
  private remote(
    connection: HarnessSocket,
    frame: Extract<NodeHarnessFrame, { type: 'harness_hello' }>,
  ): RemoteHarness {
    const binding = {
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
    };
    return new RemoteHarness(this.service, binding, {
      send: (control): void => {
        this.send(connection, control);
      },
      terminate: (): void => {
        connection.stop();
      },
      authenticate: (): void => {
        this.access.authenticate(connection.token);
      },
    });
  }
  private send(connection: HarnessSocket, frame: HubHarnessControl): void {
    if (connection.socket.readyState !== WebSocket.OPEN)
      throw new ApiError('conflict', 'Computer execution socket is closed.');
    connection.socket.send(JSON.stringify(frame));
  }
  private reauthenticate(): void {
    if (this.checking) return;
    this.checking = true;
    for (const connection of this.connections.values()) {
      try {
        this.access.authenticate(connection.token);
        connection.remote?.revalidate();
      } catch (cause) {
        this.log.error('harness.access_lost', cause, { device_id: connection.identity.device_id });
        connection.stop();
      }
    }
    this.checking = false;
  }
  private beat(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.stop();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }
}
function frameText(raw: RawData): string {
  return (
    Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw)
  ).toString('utf8');
}
