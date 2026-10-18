import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { ApiError, type ComputerNodeRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { ComputerNodeAccess } from '../computers/node-access';
import { bearerOf } from './http';
import { ComputerLog } from './computer-log';
import { remoteKind } from './request-trace';
import { messageOf } from '@smarteverything/logging';

const HELLO_TIMEOUT_MS = 30_000;
const HEARTBEAT_MS = 30_000;
const CLOSE_POLICY = 1008;
const CLOSE_REVOKED = 4001;
const CLOSE_REPLACED = 4002;
const REASON_LIMIT = 500;

let connectionSequence = 0;

export abstract class ComputerConnection {
  alive = true;
  readonly id = ++connectionSequence;
  readonly openedAt = performance.now();
  lastPongAt = performance.now();
  closer: string | null = null;
  frames = 0;
  rejected = 0;
  private released = false;
  private readonly helloTimer: NodeJS.Timeout;

  constructor(
    readonly socket: WebSocket,
    readonly identity: ComputerNodeRow,
    readonly lost?: () => void,
  ) {
    this.helloTimer = setTimeout(() => {
      this.close(CLOSE_POLICY, 'Computer hello timed out');
    }, HELLO_TIMEOUT_MS);
  }

  greeted(): void {
    clearTimeout(this.helloTimer);
  }

  send(frame: unknown): void {
    if (this.socket.readyState !== WebSocket.OPEN)
      throw new ApiError('conflict', 'The computer socket is closed.');
    this.socket.send(JSON.stringify(frame));
  }

  close(code: number, reason: string): void {
    this.closer ??= `hub:${reason.slice(0, 60)}`;
    this.release();
    this.socket.close(code, reason);
  }

  terminate(): void {
    this.closer ??= 'hub:terminated';
    this.release();
    this.socket.terminate();
  }

  release(): void {
    clearTimeout(this.helloTimer);
    if (this.released) return;
    this.released = true;
    this.detach();
  }

  protected abstract detach(): void;
}

export abstract class ComputerSockets<C extends ComputerConnection> {
  protected readonly connections = new Map<string, C>();
  protected stopped = false;
  private readonly server: WebSocketServer;
  private readonly heartbeat: NodeJS.Timeout;

  protected constructor(
    private readonly protocol: string,
    protected readonly access: ComputerNodeAccess,
    protected readonly log: Logger,
  ) {
    this.server = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols): string | false => (protocols.has(protocol) ? protocol : false),
    });
    this.heartbeat = setInterval(() => {
      this.beat();
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const offered = (request.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((value) => value.trim());
    if (!offered.includes(this.protocol))
      throw new ApiError(
        'invalid_request',
        `Open this socket with the ${this.protocol} subprotocol.`,
      );
    const identity = this.authenticated(request);
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(ws, identity, request);
    });
  }

  revoke(deviceId: string): void {
    const connection = this.connections.get(deviceId);
    this.log.info('computer.revoking', { deviceId, hadConnection: connection !== undefined });
    connection?.close(CLOSE_REVOKED, 'Computer access revoked');
  }

  stop(): void {
    this.log.info('computer.stopping', { protocol: this.protocol, sockets: this.connections.size });
    this.stopped = true;
    clearInterval(this.heartbeat);
    for (const connection of this.connections.values()) connection.terminate();
    this.connections.clear();
    this.server.close();
  }

  protected abstract open(
    socket: WebSocket,
    identity: ComputerNodeRow,
    request: IncomingMessage,
  ): C;

  protected abstract receive(connection: C, frame: unknown): void;

  private accept(socket: WebSocket, identity: ComputerNodeRow, request: IncomingMessage): void {
    const events = new ComputerLog(this.log, this.protocol);
    const previous = this.connections.get(identity.device_id);
    if (previous !== undefined) {
      events.replacing(identity.device_id, previous);
      previous.close(CLOSE_REPLACED, 'Replaced by a new connection');
    }
    const connection = this.open(socket, identity, request);
    this.connections.set(identity.device_id, connection);
    events.connected(
      connection,
      identity.device_id,
      remoteKind(request.socket.remoteAddress),
      this.connections.size,
    );
    socket.on('message', (raw: RawData, binary: boolean) => {
      if (this.stopped || this.connections.get(identity.device_id) !== connection) return;
      connection.frames += 1;
      try {
        if (binary) throw new ApiError('invalid_request', 'Computer frames require JSON text.');
        this.receive(connection, JSON.parse(frameText(raw)));
      } catch (cause) {
        connection.rejected += 1;
        events.rejected(connection, identity.device_id, cause);
      }
    });
    socket.on('pong', () => {
      connection.alive = true;
      connection.lastPongAt = performance.now();
    });
    socket.on('error', (cause: Error) => {
      events.failed(connection, identity.device_id, cause);
    });
    socket.on('close', (closeCode: number, reason: Buffer) => {
      events.closed(connection, identity.device_id, {
        code: closeCode,
        reason,
        current: this.connections.get(identity.device_id) === connection,
      });
      connection.release();
      if (this.stopped || this.connections.get(identity.device_id) !== connection) return;
      this.connections.delete(identity.device_id);
      connection.lost?.();
    });
  }

  private authenticated(request: IncomingMessage): ComputerNodeRow {
    try {
      return this.access.authenticate(bearerOf(request));
    } catch (cause) {
      this.log.warn('computer.auth_failed', {
        protocol: this.protocol,
        hasBearer: bearerOf(request) !== null,
        errorName: cause instanceof Error ? cause.name : 'unknown',
        reason: messageOf(cause).slice(0, REASON_LIMIT),
      });
      throw cause;
    }
  }

  private beat(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.closer ??= 'hub:heartbeat_missed';
        this.log.warn('computer.heartbeat_missed', {
          protocol: this.protocol,
          socketId: connection.id,
          deviceId: connection.identity.device_id,
          sinceLastPongMs: Math.round(performance.now() - connection.lastPongAt),
          heartbeatMs: HEARTBEAT_MS,
        });
        connection.terminate();
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
