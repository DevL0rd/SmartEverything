import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  LIVE_CLIENT_MESSAGE,
  LIVE_PROTOCOL,
  type ClientRow,
  type FirewallStatus,
  type HubStatus,
  type LiveChange,
  type LiveStream,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { z } from 'zod';
import type { Store } from '../store/store';
import { socketClient } from './socket-auth';
import { issuesOf } from './errors';
import {
  CURRENT_DIALECT,
  type Greeting,
  type LiveDialect,
  type LiveNotice,
  type Outgoing,
  type Subscription,
} from './live-dialect';
import { readLegacySubscribe } from './live-legacy';
import {
  allowedStreams,
  allowedTables,
  visible,
  type Connection,
  type ProfileLookup,
} from './live-visibility';
import { LIVENESS_PROBE_MS, answersPing, receives, type LiveReceiver } from './live-reach';

export type { LiveNotice } from './live-dialect';

const HEARTBEAT_MS = 30_000;

const SLOW_CLIENT_BYTES = 8 * 1024 * 1024;

const POLICY_VIOLATION = 1008;
const TOKEN_WITHDRAWN = 4001;

export type LiveAudience = 'everyone' | 'owners' | LiveStream;

export interface LiveOptions {
  readonly store: Store;
  readonly status: () => HubStatus;
  readonly log: Logger;
}

function hears(
  connection: Connection,
  dialect: LiveDialect | undefined,
  notice: LiveNotice,
  audience: LiveAudience,
): boolean {
  if (dialect?.hears(notice) !== true) {
    return false;
  }
  if (audience === 'everyone') {
    return true;
  }
  if (audience === 'owners') {
    return connection.client.role === 'owner';
  }
  return connection.streams.has(audience);
}

function readSubscribe(raw: unknown): Subscription | z.ZodError {
  const legacy = readLegacySubscribe(raw);
  if (legacy !== null) {
    return legacy;
  }
  const parsed = LIVE_CLIENT_MESSAGE.safeParse(raw);
  return parsed.success ? { dialect: CURRENT_DIALECT, message: parsed.data } : parsed.error;
}

export class LiveHub {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>): string | false =>
      protocols.has(LIVE_PROTOCOL) ? LIVE_PROTOCOL : false,
  });
  private readonly connections = new Set<Connection>();
  private readonly dialects = new Map<Connection, LiveDialect>();
  private readonly primers = new Map<LiveStream, (profileId: string) => readonly LiveNotice[]>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: LiveOptions) {
    this.unsubscribe = options.store.feed.subscribe((change) => {
      this.broadcast(change);
    });
    this.heartbeat = setInterval(() => {
      this.beat();
    }, HEARTBEAT_MS);
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(this.options.store, request, LIVE_PROTOCOL, '/live');
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(client, ws);
    });
  }

  connectedClients(): ReadonlySet<string> {
    return new Set([...this.connections].map((connection) => connection.client.id));
  }

  async deliver(
    clientId: string,
    notice: LiveNotice,
    receiver: LiveReceiver = 'any',
  ): Promise<number> {
    const own = [...this.connections].filter(
      (connection) => connection.client.id === clientId && receives(connection.streams, receiver),
    );
    const reached = await Promise.all(
      own.map(async (connection): Promise<boolean> => {
        if (!(await answersPing(connection.socket, LIVENESS_PROBE_MS))) {
          this.options.log.warn('live.connection_unresponsive', { clientId });
          return false;
        }
        this.send(connection, notice);
        return true;
      }),
    );
    return reached.filter(Boolean).length;
  }

  presence(): void {
    this.announce({ type: 'presence', hub: this.options.status() }, 'everyone');
  }

  firewall(status: FirewallStatus): void {
    this.announce({ type: 'firewall', firewall: status }, 'everyone');
  }

  announce(notice: LiveNotice, audience: LiveAudience): void {
    for (const connection of this.connections) {
      if (hears(connection, this.dialects.get(connection), notice, audience)) {
        this.send(connection, notice);
      }
    }
  }

  profileChanged(clientId: string, profileId: string): void {
    for (const connection of this.connections) {
      if (connection.client.id === clientId && this.dialects.get(connection)?.name === 'current') {
        this.send(connection, { type: 'profile_changed', profileId });
      }
    }
  }

  prime(stream: LiveStream, primer: (profileId: string) => readonly LiveNotice[]): void {
    this.primers.set(stream, primer);
  }

  profileNotice(notice: LiveNotice, profileId: string, stream: LiveStream): void {
    for (const connection of this.connections) {
      const own = this.options.store.profiles.activeOf(connection.client.id).id === profileId;
      if (own && hears(connection, this.dialects.get(connection), notice, stream)) {
        this.send(connection, notice);
      }
    }
  }

  clientListening(clientId: string, stream: LiveStream): boolean {
    return [...this.connections].some(
      (connection) => connection.client.id === clientId && connection.streams.has(stream),
    );
  }

  closeClient(clientId: string): void {
    for (const connection of this.connections) {
      if (connection.client.id === clientId) {
        connection.socket.close(TOKEN_WITHDRAWN, 'token withdrawn');
      }
    }
  }

  stop(): void {
    clearInterval(this.heartbeat);
    this.unsubscribe();
    for (const connection of this.connections) {
      connection.socket.terminate();
    }
    this.server.close();
  }

  private accept(client: ClientRow, socket: WebSocket): void {
    const connection: Connection = {
      client,
      socket,
      tables: new Set(),
      streams: new Set(),
      alive: true,
    };
    this.connections.add(connection);
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (data) => {
      this.receive(connection, data);
    });
    socket.once('close', () => {
      this.connections.delete(connection);
      this.dialects.delete(connection);
    });
    socket.on('error', (cause) => {
      this.options.log.warn('live.socket_failed', { clientId: client.id, reason: cause.message });
    });
    this.options.log.info('live.connected', { clientId: client.id });
  }

  private receive(connection: Connection, data: RawData): void {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : '';
    const read = readSubscribe(this.json(text));
    if (read instanceof z.ZodError) {
      this.send(connection, {
        type: 'refused',
        error: {
          code: 'invalid_request',
          message: `The live message is not valid: ${issuesOf(read)}.`,
        },
      });
      connection.socket.close(POLICY_VIOLATION, 'invalid message');
      return;
    }
    const dialect = this.dialects.get(connection) ?? this.greet(connection, read.dialect);
    this.subscribe(connection, dialect, read.message);
  }

  private greet(connection: Connection, dialect: LiveDialect): LiveDialect {
    const { client } = connection;
    this.dialects.set(connection, dialect);
    if (dialect.name === 'legacy') {
      this.options.log.warn('live.legacy_protocol', {
        clientId: client.id,
        reason: 'subscribe without streams; old ready/subscribed shapes and no new notices',
      });
    }
    const greeting: Greeting = {
      type: 'ready',
      clientId: client.id,
      role: client.role,
      hub: this.options.status(),
    };
    this.send(connection, dialect.ready(greeting, this.options.store.feed.seq));
    return dialect;
  }

  private subscribe(
    connection: Connection,
    dialect: LiveDialect,
    message: Subscription['message'],
  ): void {
    const tables = allowedTables(connection.client, message.tables);
    const streams = allowedStreams(connection.client, message.streams);
    connection.tables.clear();
    connection.streams.clear();
    tables.forEach((table) => connection.tables.add(table));
    streams.forEach((stream) => connection.streams.add(stream));
    this.send(connection, dialect.subscribed(tables, streams, this.options.store.feed.seq));
    this.primeConnection(connection, dialect);
  }

  private primeConnection(connection: Connection, dialect: LiveDialect): void {
    const profileId = this.options.store.profiles.activeOf(connection.client.id).id;
    for (const [stream, primer] of this.primers) {
      if (connection.streams.has(stream)) {
        primer(profileId)
          .filter((notice) => dialect.hears(notice))
          .forEach((notice) => {
            this.send(connection, notice);
          });
      }
    }
  }

  private json(text: string): unknown {
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return text;
      }
      throw error;
    }
  }

  private broadcast(change: LiveChange): void {
    const profileOf: ProfileLookup = (clientId) =>
      this.options.store.profiles.activeOf(clientId).id;
    for (const connection of this.connections) {
      if (visible(connection, change, profileOf)) {
        this.send(connection, change);
      }
    }
  }

  private send(connection: Connection, message: Outgoing): void {
    if (connection.socket.bufferedAmount > SLOW_CLIENT_BYTES) {
      this.options.log.warn('live.client_too_slow', { clientId: connection.client.id });
      connection.socket.terminate();
      return;
    }
    connection.socket.send(JSON.stringify(message));
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
