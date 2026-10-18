import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { TalkFrameError, type ClientRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { z } from 'zod';
import type { Store } from '../store/store';
import { SocketStats } from './live-stats';
import { EndpointLog } from './endpoint-log';
import { remoteKind } from './request-trace';
import { socketClient } from './socket-auth';
import { clientSocketsOf } from './client-sockets';

const SLOW_CLIENT_BYTES = 512 * 1024;

export interface SocketPeer {
  readonly client: ClientRow;
  readonly text: (message: unknown) => void;
  readonly frame: (frame: Uint8Array) => void;
  readonly close: (code: number, reason: string) => void;
}

export interface SocketSession<Message> {
  readonly message: (message: Message) => void;
  readonly frame: (frame: Buffer) => void;
  readonly closed: () => void;
}

export interface SocketEndpointOptions<Message> {
  readonly name: string;
  readonly store: Store;
  readonly protocol: string;
  readonly path: string;
  readonly heartbeatMs: number;
  readonly schema: z.ZodType<Message>;
  readonly log: Logger;
  readonly open: (peer: SocketPeer) => SocketSession<Message>;
}

interface Connection<Message> {
  readonly peer: SocketPeer;
  readonly socket: WebSocket;
  readonly session: SocketSession<Message>;
  alive: boolean;
  readonly ignored: Edge;
  readonly id: number;
  readonly openedAt: number;
  readonly stats: SocketStats;
}

class Edge {
  private on = false;

  rises(value: boolean): boolean {
    const rose = value && !this.on;
    this.on = value;
    return rose;
  }
}

function bytesOf(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

function jsonOf(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
}

export class SocketEndpoint<Message> {
  private readonly server: WebSocketServer;
  private readonly connections = new Set<Connection<Message>>();
  private readonly heartbeat: NodeJS.Timeout;
  private sequence = 0;

  constructor(private readonly options: SocketEndpointOptions<Message>) {
    this.server = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols: Set<string>): string | false =>
        protocols.has(options.protocol) ? options.protocol : false,
    });
    this.heartbeat = setInterval(() => {
      this.beat();
    }, options.heartbeatMs);
    this.heartbeat.unref();
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(
      this.options.store,
      request,
      this.options.protocol,
      this.options.path,
    );
    this.server.handleUpgrade(request, socket, head, (ws) => {
      clientSocketsOf(this.options.store).track(client.id, ws);
      this.accept(client, ws, request);
    });
  }

  peers(): readonly SocketPeer[] {
    return [...this.connections].map((connection) => connection.peer);
  }

  stop(): void {
    this.options.log.info(`${this.options.name}.stopping`, { sockets: this.connections.size });
    clearInterval(this.heartbeat);
    this.connections.forEach((connection) => {
      connection.stats.closedBy('hub:shutdown');
      connection.socket.terminate();
    });
    this.server.close();
  }

  private accept(client: ClientRow, socket: WebSocket, request: IncomingMessage): void {
    const { log, name } = this.options;
    const events = new EndpointLog(log, name);
    const dropping = new Edge();
    const peer: SocketPeer = {
      client,
      text: (message) => {
        socket.send(JSON.stringify(message));
      },
      frame: (frame) => {
        this.sendFrame(socket, client, dropping, frame);
      },
      close: (code, reason) => {
        events.closing(connection, code, reason);
        socket.close(code, reason);
      },
    };
    this.sequence += 1;
    const connection: Connection<Message> = {
      peer,
      socket,
      session: this.options.open(peer),
      alive: true,
      ignored: new Edge(),
      id: this.sequence,
      openedAt: performance.now(),
      stats: new SocketStats(),
    };
    this.connections.add(connection);
    events.connected(connection, remoteKind(request.socket.remoteAddress), this.connections.size);
    socket.on('pong', () => {
      connection.alive = true;
      connection.stats.ponged();
    });
    socket.on('message', (data, binary) => {
      this.receive(connection, bytesOf(data), binary);
    });
    socket.once('close', (closeCode: number, reason: Buffer) => {
      this.connections.delete(connection);
      connection.session.closed();
      events.closed(connection, {
        code: closeCode,
        reason,
        remaining: this.connections.size,
      });
    });
    socket.on('error', (cause: Error & { code?: string }) => {
      events.failed(connection, cause);
    });
  }

  private receive(connection: Connection<Message>, data: Buffer, binary: boolean): void {
    if (!binary) {
      connection.stats.message();
      const parsed = this.options.schema.safeParse(jsonOf(data.toString('utf8')));
      if (parsed.success) {
        connection.session.message(parsed.data);
      } else {
        this.ignore(connection, `unreadable ${this.options.name} message`);
      }
      return;
    }
    connection.stats.frame(data.byteLength);
    try {
      connection.session.frame(data);
    } catch (cause) {
      if (!(cause instanceof TalkFrameError)) {
        throw cause;
      }
      this.ignore(connection, cause.message);
    }
  }

  private ignore(connection: Connection<Message>, reason: string): void {
    if (connection.ignored.rises(true)) {
      this.options.log.warn(`${this.options.name}.ignored`, {
        socketId: connection.id,
        clientId: connection.peer.client.id,
        reason,
        messages: connection.stats.messages,
        frames: connection.stats.frames,
      });
    }
  }

  private sendFrame(socket: WebSocket, client: ClientRow, dropping: Edge, frame: Uint8Array): void {
    const slow = socket.bufferedAmount > SLOW_CLIENT_BYTES;
    if (dropping.rises(slow)) {
      this.options.log.warn(`${this.options.name}.client_too_slow`, {
        clientId: client.id,
        bufferedBytes: socket.bufferedAmount,
        limitBytes: SLOW_CLIENT_BYTES,
      });
    }
    if (!slow) {
      socket.send(frame);
    }
  }

  private beat(): void {
    for (const connection of this.connections) {
      if (!connection.alive) {
        connection.stats.closedBy('hub:heartbeat_missed');
        this.options.log.warn(`${this.options.name}.heartbeat_missed`, {
          socketId: connection.id,
          clientId: connection.peer.client.id,
          sinceLastPongMs: connection.stats.sinceLastPongMs(),
          heartbeatMs: this.options.heartbeatMs,
          bufferedBytes: connection.socket.bufferedAmount,
        });
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }
}
