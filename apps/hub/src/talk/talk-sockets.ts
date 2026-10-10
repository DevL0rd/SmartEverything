import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  TALK_CLIENT_MESSAGE,
  TALK_FRAMES_PER_SECOND_MAX,
  TALK_HEARTBEAT_MS,
  TALK_PATH,
  TALK_PROTOCOL,
  TalkFrameError,
  packetOfFrame,
  type ClientRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { Store } from '../store/store';
import { socketClient } from '../server/socket-auth';
import type { TalkRelay } from './relay';
import type { TalkEndpoint } from './transmission';

const POLICY_VIOLATION = 1008;
const TOKEN_WITHDRAWN = 4001;
const BURST_FRAMES = 100;
const SLOW_CLIENT_BYTES = 512 * 1024;

class FrameBudget {
  private tokens = BURST_FRAMES;
  private refilledAt = Date.now();

  spend(): boolean {
    const now = Date.now();
    const refill = ((now - this.refilledAt) / 1000) * TALK_FRAMES_PER_SECOND_MAX;
    this.tokens = Math.min(BURST_FRAMES, this.tokens + refill) - 1;
    this.refilledAt = now;
    return this.tokens >= 0;
  }
}

interface Connection {
  readonly endpoint: TalkEndpoint;
  readonly socket: WebSocket;
  readonly budget: FrameBudget;
  alive: boolean;
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

export interface TalkSocketsOptions {
  readonly store: Store;
  readonly relay: TalkRelay;
  readonly log: Logger;
}

export class TalkSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>): string | false =>
      protocols.has(TALK_PROTOCOL) ? TALK_PROTOCOL : false,
  });
  private readonly connections = new Set<Connection>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly options: TalkSocketsOptions) {
    this.heartbeat = setInterval(() => {
      this.beat();
    }, TALK_HEARTBEAT_MS);
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(this.options.store, request, TALK_PROTOCOL, TALK_PATH);
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(client, ws);
    });
  }

  closeClient(clientId: string): void {
    for (const connection of this.connections) {
      if (connection.endpoint.clientId === clientId) {
        connection.socket.close(TOKEN_WITHDRAWN, 'token withdrawn');
      }
    }
  }

  stop(): void {
    clearInterval(this.heartbeat);
    for (const connection of this.connections) {
      connection.socket.terminate();
    }
    this.server.close();
  }

  private accept(client: ClientRow, socket: WebSocket): void {
    const endpoint: TalkEndpoint = {
      id: randomUUID(),
      clientId: client.id,
      send: (message) => {
        this.send(connection, JSON.stringify(message));
      },
      audio: (frame) => {
        this.send(connection, frame);
      },
    };
    const connection: Connection = {
      endpoint,
      socket,
      budget: new FrameBudget(),
      alive: true,
    };
    this.connections.add(connection);
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data, binary) => {
      this.receive(connection, bytesOf(data), binary);
    });
    socket.once('close', () => {
      this.connections.delete(connection);
      this.options.relay.disconnect(endpoint.id);
      this.options.log.info('talk.disconnected', { clientId: client.id });
    });
    socket.on('error', (cause) => {
      this.options.log.warn('talk.socket_failed', { clientId: client.id, reason: cause.message });
    });
    this.options.log.info('talk.connected', { clientId: client.id });
    this.options.relay.connect(endpoint);
  }

  private receive(connection: Connection, data: Buffer, binary: boolean): void {
    if (binary) {
      this.audio(connection, data);
      return;
    }
    const parsed = TALK_CLIENT_MESSAGE.safeParse(jsonOf(data.toString('utf8')));
    if (!parsed.success) {
      this.refuse(connection, 'invalid talk message');
      return;
    }
    const { relay } = this.options;
    const message = parsed.data;
    if (message.type === 'press') {
      relay.press(connection.endpoint, message.channelId);
    } else if (message.type === 'listen') {
      relay.listen(connection.endpoint, message.channelId, message.cameraId);
    } else {
      relay.release(connection.endpoint.id);
    }
  }

  private audio(connection: Connection, data: Buffer): void {
    if (!connection.budget.spend()) {
      this.refuse(connection, 'too many audio frames');
      return;
    }
    try {
      this.options.relay.audio(connection.endpoint.id, packetOfFrame(data));
    } catch (cause) {
      if (!(cause instanceof TalkFrameError)) {
        throw cause;
      }
      this.refuse(connection, cause.message);
    }
  }

  private refuse(connection: Connection, reason: string): void {
    this.options.log.warn('talk.refused', { clientId: connection.endpoint.clientId, reason });
    connection.socket.close(POLICY_VIOLATION, reason.slice(0, 120));
  }

  private send(connection: Connection, data: string | Uint8Array): void {
    if (connection.socket.bufferedAmount > SLOW_CLIENT_BYTES) {
      this.options.log.warn('talk.client_too_slow', { clientId: connection.endpoint.clientId });
      connection.socket.terminate();
      return;
    }
    connection.socket.send(data);
  }

  private beat(): void {
    for (const connection of this.connections) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }
}
