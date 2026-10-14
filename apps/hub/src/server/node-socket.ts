import { RemoteComputerRuntimeHost } from '../computers/remote-runtime-host';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ApiError,
  NODE_AI_FRAME,
  NODE_AI_FRAME_V2,
  NODE_AI_PROTOCOL_V2,
  NODE_AI_MANAGED_PROJECT_PROTOCOL,
  type NodeAiFrame,
  type NodeAiFrameV2,
  type HubAiControlV2,
  NODE_AI_PROTOCOL,
  type ComputerNodeRow,
  type HubAiControl,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import type { Store } from '../store/store';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { ComputerNodeAccess } from '../computers/node-access';
import { RemoteComputerAiHost } from '../computers/remote-ai-host';
import { bearerOf } from './http';

const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD = 32 * 1024 * 1024;
class Connection {
  host: RemoteComputerAiHost | null = null;
  readonly runtimes = new Map<string, RemoteComputerRuntimeHost>();
  greeted = false;
  leave: (() => void) | null = null;
  alive = true;
  readonly helloTimer: NodeJS.Timeout;

  constructor(
    readonly socket: WebSocket,
    readonly identity: ComputerNodeRow,
    readonly token: string | null,
  ) {
    this.helloTimer = setTimeout(() => {
      socket.close(1008, 'Computer hello timed out');
    }, HELLO_TIMEOUT_MS);
  }
  greet(host: RemoteComputerAiHost, leave: () => void): void {
    this.greeted = true;
    this.host = host;
    this.leave = leave;
  }
  register(runtime: string, host: RemoteComputerRuntimeHost): void {
    this.runtimes.set(runtime, host);
  }
  complete(leave: () => void): void {
    this.leave = leave;
    this.greeted = true;
  }
  pong(): void {
    this.alive = true;
  }
}
export class ComputerNodeSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    handleProtocols: selectedProtocol,
  });
  private readonly connections = new Map<string, Connection>();
  private readonly heartbeat: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly store: Store,
    private readonly access: ComputerNodeAccess,
    private readonly directory: ComputerAiDirectory,
    private readonly log: Logger,
  ) {
    this.heartbeat = setInterval(() => {
      this.beat();
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const protocol = request.headers['sec-websocket-protocol'];
    if (
      typeof protocol !== 'string' ||
      !protocol
        .split(',')
        .map((value) => value.trim())
        .some((value) => NODE_PROTOCOLS.includes(value))
    )
      throw new ApiError(
        'invalid_request',
        'The computer node requires its versioned WebSocket subprotocol.',
      );
    const token = bearerOf(request);
    const identity = this.access.authenticate(token);
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(ws, identity, token);
    });
  }

  revoke(deviceId: string): void {
    this.store.computerNodes.revoke(deviceId);
    const connection = this.connections.get(deviceId);
    connection?.leave?.();
    connection?.socket.close(4001, 'Computer node access revoked');
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.heartbeat);
    for (const connection of this.connections.values()) {
      clearTimeout(connection.helloTimer);
      connection.leave?.();
      connection.socket.terminate();
    }
    this.connections.clear();
    this.server.close();
  }

  private accept(socket: WebSocket, identity: ComputerNodeRow, token: string | null): void {
    const prior = this.connections.get(identity.device_id);
    if (prior !== undefined) {
      prior.leave?.();
      prior.socket.close(4002, 'Replaced by a new connection');
    }
    const connection = new Connection(socket, identity, token);
    this.connections.set(identity.device_id, connection);
    socket.on('message', (raw: RawData) => {
      this.received(connection, raw);
    });
    socket.on('pong', () => {
      connection.pong();
    });
    socket.on('error', (cause: Error) => {
      this.log.error('computer.socket_failed', cause, { deviceId: identity.device_id });
    });
    socket.on('close', () => {
      this.closed(connection);
    });
  }

  private received(connection: Connection, raw: RawData): void {
    if (this.stopped || this.connections.get(connection.identity.device_id) !== connection) return;
    try {
      const current = this.access.authenticate(connection.token);
      if (current.device_id !== connection.identity.device_id)
        throw new ApiError('forbidden', 'The computer identity binding changed.');
      if (connection.socket.protocol !== NODE_AI_PROTOCOL) {
        this.receivedV2(connection, NODE_AI_FRAME_V2.parse(JSON.parse(frameText(raw))));
        return;
      }
      this.receivedV1(connection, NODE_AI_FRAME.parse(JSON.parse(frameText(raw))));
    } catch (cause) {
      this.rejected(connection, cause);
    }
  }
  private receivedV1(connection: Connection, frame: NodeAiFrame): void {
    if (frame.type === 'hello') {
      if (connection.host !== null || frame.hello.machineId !== connection.identity.machine_id)
        throw new ApiError(
          'forbidden',
          'The computer hello does not match its paired machine identity.',
        );
      this.greeted(connection);
      return;
    }
    if (connection.host === null)
      throw new ApiError('forbidden', 'The computer must complete its authenticated hello first.');
    connection.host.receive(frame);
  }
  private rejected(connection: Connection, cause: unknown): void {
    this.log.warn('computer.frame_rejected', {
      deviceId: connection.identity.device_id,
      reason: cause instanceof ApiError ? cause.message : 'Malformed node frame',
    });
    connection.socket.close(1008, 'Invalid computer node frame');
  }

  private receivedV2(connection: Connection, frame: NodeAiFrameV2): void {
    if (frame.type === 'hello') {
      if (connection.greeted || frame.hello.machineId !== connection.identity.machine_id)
        throw new ApiError('forbidden', 'Runtime hello does not match paired machine identity.');
      this.greetedV2(connection, frame);
      return;
    }
    if (!connection.greeted)
      throw new ApiError('forbidden', 'Runtime node must complete its authenticated hello first.');
    for (const host of connection.runtimes.values()) host.receive(frame);
  }
  private greetedV2(
    connection: Connection,
    hello: Extract<NodeAiFrameV2, { type: 'hello' }>,
  ): void {
    clearTimeout(connection.helloTimer);
    const deviceId = connection.identity.device_id;
    const generation = randomUUID();
    const send = (frame: HubAiControlV2): void => {
      if (connection.socket.readyState !== connection.socket.OPEN)
        throw new ApiError('claude_not_ready', 'Runtime node socket is closed.');
      connection.socket.send(JSON.stringify(frame));
    };
    const leaves = hello.runtimes.map((runtime) => {
      const host = new RemoteComputerRuntimeHost(runtime, deviceId, generation, send);
      connection.register(runtime, host);
      return this.directory.attachRuntime({ device_id: deviceId, runtime }, host, false);
    });
    connection.complete((): void => {
      for (const leave of leaves) leave();
    });
    this.store.devices.setOnline([deviceId], true);
    send({
      type: 'welcome',
      device_id: deviceId,
      generation,
      runtimes: hello.runtimes.map((runtime) =>
        this.store.computerRuntimes.settings({ device_id: deviceId, runtime }),
      ),
    });
  }

  private greeted(connection: Connection): void {
    clearTimeout(connection.helloTimer);
    const deviceId = connection.identity.device_id;
    const generation = randomUUID();
    const send = (frame: HubAiControl): void => {
      if (connection.socket.readyState !== connection.socket.OPEN)
        throw new ApiError('claude_not_ready', 'The computer node socket is closed.');
      connection.socket.send(JSON.stringify(frame));
    };
    const host = new RemoteComputerAiHost(deviceId, generation, send, () => {
      connection.socket.close();
    });
    connection.greet(host, this.directory.attach(deviceId, host, false));
    this.store.devices.setOnline([deviceId], true);
    send({
      type: 'welcome',
      device_id: deviceId,
      generation,
      settings: this.store.computerAi.settings(deviceId),
    });
  }

  private closed(connection: Connection): void {
    clearTimeout(connection.helloTimer);
    if (this.stopped) return;
    connection.leave?.();
    if (this.connections.get(connection.identity.device_id) !== connection) return;
    this.connections.delete(connection.identity.device_id);
    this.store.devices.setOnline([connection.identity.device_id], false);
  }

  private beat(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }
}

function frameText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw.toString('utf8');
}

const NODE_PROTOCOLS: readonly string[] = [
  NODE_AI_MANAGED_PROJECT_PROTOCOL,
  NODE_AI_PROTOCOL_V2,
  NODE_AI_PROTOCOL,
];
function selectedProtocol(protocols: Set<string>): string | false {
  return NODE_PROTOCOLS.find((protocol) => protocols.has(protocol)) ?? false;
}
