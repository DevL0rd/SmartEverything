import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ASSISTANT_VOICE_CLIENT_MESSAGE,
  ASSISTANT_VOICE_HEARTBEAT_MS,
  ASSISTANT_VOICE_PATH,
  ASSISTANT_VOICE_PROTOCOL,
  SIGHT_FRAME_LIMITS,
  TALK_FRAMES_PER_SECOND_MAX,
  TalkFrameError,
  frameKindOf,
  packetOfFrame,
  sightOfFrame,
  type AssistantVoiceClientMessage,
  type ClientRow,
  type SightFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { socketClient } from '../server/socket-auth';
import type { Store } from '../store/store';
import type { VoiceEndpoint } from './call-link';

const POLICY_VIOLATION = 1008;
const SLOW_CLIENT_BYTES = 512 * 1024;
const BUDGET_WINDOW_MS = 1000;

export interface VoiceSocketHandlers {
  readonly connected: (endpoint: VoiceEndpoint) => void;
  readonly message: (
    endpoint: VoiceEndpoint,
    client: ClientRow,
    message: AssistantVoiceClientMessage,
  ) => void;
  readonly audio: (endpoint: VoiceEndpoint, packet: Uint8Array) => void;
  readonly sight: (endpoint: VoiceEndpoint, frame: SightFrame) => void;
  readonly disconnected: (endpoint: VoiceEndpoint) => void;
}

interface Connection {
  readonly endpoint: VoiceEndpoint;
  readonly client: ClientRow;
  readonly socket: WebSocket;
  readonly health: ConnectionHealth;
}

class ConnectionHealth {
  private alive = true;
  private windowStart = Date.now();
  private frames = 0;
  private pictures = 0;

  answered(): void {
    this.alive = true;
  }

  checked(): boolean {
    const wasAlive = this.alive;
    this.alive = false;
    return wasAlive;
  }

  spend(now: number): boolean {
    this.roll(now);
    this.frames += 1;
    return this.frames <= TALK_FRAMES_PER_SECOND_MAX * 2;
  }

  spendPicture(now: number): boolean {
    this.roll(now);
    this.pictures += 1;
    return this.pictures <= SIGHT_FRAME_LIMITS.hardPerSecond * 2;
  }

  private roll(now: number): void {
    if (now - this.windowStart >= BUDGET_WINDOW_MS) {
      this.windowStart = now;
      this.frames = 0;
      this.pictures = 0;
    }
  }
}

function bytesOf(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

function parsed(text: string): AssistantVoiceClientMessage | null {
  try {
    const result = ASSISTANT_VOICE_CLIENT_MESSAGE.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
}

export class VoiceSockets {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>): string | false =>
      protocols.has(ASSISTANT_VOICE_PROTOCOL) ? ASSISTANT_VOICE_PROTOCOL : false,
  });
  private readonly connections = new Set<Connection>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(
    private readonly store: Store,
    private readonly handlers: VoiceSocketHandlers,
    private readonly log: Logger,
  ) {
    this.heartbeat = setInterval(() => {
      this.beat();
    }, ASSISTANT_VOICE_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(
      this.store,
      request,
      ASSISTANT_VOICE_PROTOCOL,
      ASSISTANT_VOICE_PATH,
    );
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(client, ws);
    });
  }

  endpoints(): VoiceEndpoint[] {
    return [...this.connections].map((connection) => connection.endpoint);
  }

  stop(): void {
    clearInterval(this.heartbeat);
    this.connections.forEach((connection) => {
      connection.socket.terminate();
    });
    this.server.close();
  }

  private accept(client: ClientRow, socket: WebSocket): void {
    const connection: Connection = {
      endpoint: {
        id: randomUUID(),
        clientId: client.id,
        send: (message): void => {
          this.send(connection, JSON.stringify(message));
        },
        audio: (frame): void => {
          this.send(connection, frame);
        },
      },
      client,
      socket,
      health: new ConnectionHealth(),
    };
    this.connections.add(connection);
    socket.on('pong', () => {
      connection.health.answered();
    });
    socket.on('message', (data, binary) => {
      this.receive(connection, bytesOf(data), binary);
    });
    socket.once('close', () => {
      this.connections.delete(connection);
      this.handlers.disconnected(connection.endpoint);
    });
    socket.on('error', (cause) => {
      this.log.warn('voice.socket_failed', { clientId: client.id, reason: cause.message });
    });
    this.handlers.connected(connection.endpoint);
  }

  private receive(connection: Connection, data: Buffer, binary: boolean): void {
    if (binary) {
      this.binary(connection, data);
      return;
    }
    const message = parsed(data.toString('utf8'));
    if (message === null) {
      this.refuse(connection, 'invalid assistant message');
      return;
    }
    this.handlers.message(connection.endpoint, connection.client, message);
  }

  private binary(connection: Connection, data: Buffer): void {
    try {
      if (frameKindOf(data) === 'audio') {
        this.audio(connection, data);
      } else {
        this.picture(connection, data);
      }
    } catch (cause) {
      if (!(cause instanceof TalkFrameError)) {
        throw cause;
      }
      this.refuse(connection, cause.message);
    }
  }

  private audio(connection: Connection, data: Buffer): void {
    if (!connection.health.spend(Date.now())) {
      this.refuse(connection, 'too many audio frames');
      return;
    }
    this.handlers.audio(connection.endpoint, packetOfFrame(data));
  }

  private picture(connection: Connection, data: Buffer): void {
    if (!connection.health.spendPicture(Date.now())) {
      this.refuse(connection, 'too many picture frames');
      return;
    }
    this.handlers.sight(connection.endpoint, sightOfFrame(data));
  }

  private refuse(connection: Connection, reason: string): void {
    this.log.warn('voice.refused', { clientId: connection.client.id, reason });
    connection.socket.close(POLICY_VIOLATION, reason.slice(0, 120));
  }

  private send(connection: Connection, data: string | Uint8Array): void {
    if (connection.socket.bufferedAmount > SLOW_CLIENT_BYTES) {
      this.log.warn('voice.client_too_slow', { clientId: connection.client.id });
      connection.socket.terminate();
      return;
    }
    connection.socket.send(data);
  }

  private beat(): void {
    this.connections.forEach((connection) => {
      if (!connection.health.checked()) {
        connection.socket.terminate();
        return;
      }
      connection.socket.ping();
    });
  }
}
