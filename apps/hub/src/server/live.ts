import { hears, readSubscribe } from './live-subscribe';
import { clientSocketsOf } from './client-sockets';
import { LivePreviewOwners } from './live-preview-owners';
import { LiveVoice } from './live-voice';
import { LiveWatch } from './live-watch';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  LIVE_PROTOCOL,
  splitLiveTables,
  type ClientRow,
  type FirewallStatus,
  type HubStatus,
  type LiveChange,
  type LiveSubscribeMessage,
  type LiveMessage,
  type LiveStream,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  HEARTBEAT_MS,
  SLOW_CLIENT_BYTES,
  logClosed,
  logConnected,
  logHeartbeatMissed,
  logSocketFailed,
  logSummary,
  logTooSlow,
  watchBacklog,
  type LoggedConnection,
} from './live-log';
import { LiveTally, SocketStats } from './live-stats';
import { remoteKind } from './request-trace';
import { closeClientSockets } from './live-closing';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { z } from 'zod';
import type { Store } from '../store/store';
import { socketClient } from './socket-auth';
import { issuesOf } from './errors';
import { allowedStreams, allowedTables, projected } from './live-visibility';
import { liveText } from './live-wire';
import { LIVENESS_PROBE_MS, answersPing } from './live-reach';
import { LiveNotifications } from './live-notifications';

export type LiveNotice = Exclude<LiveMessage, { type: 'change' | 'ready' | 'subscribed' }>;

const POLICY_VIOLATION = 1008;
type LiveConnection = LoggedConnection;

export type LiveAudience = 'everyone' | 'owners' | LiveStream;

export interface LiveOptions {
  readonly store: Store;
  readonly status: () => HubStatus;
  readonly log: Logger;
}

export class LiveHub {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols: Set<string>): string | false =>
      protocols.has(LIVE_PROTOCOL) ? LIVE_PROTOCOL : false,
  });
  readonly previewOwners = new LivePreviewOwners();
  readonly watches: LiveWatch<LiveConnection>;
  readonly voice: LiveVoice<LiveConnection>;
  readonly notifications: LiveNotifications;
  private readonly connections = new Set<LiveConnection>();
  private readonly backgrounds = new WeakSet<LiveConnection>();
  private tally = new LiveTally();
  private sequence = 0;
  private readonly primers = new Map<LiveStream, (profileId: string) => readonly LiveNotice[]>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly unsubscribe: readonly (() => void)[];

  constructor(private readonly options: LiveOptions) {
    this.watches = new LiveWatch({ send: this.send.bind(this), log: options.log });
    this.notifications = new LiveNotifications(
      (clientId, notice) => this.deliver(clientId, notice),
      options.log,
    );
    this.voice = new LiveVoice({
      send: this.send.bind(this),
      profileOf: (clientId): string => options.store.profiles.activeOf(clientId).id,
      log: options.log,
    });
    this.unsubscribe = [
      options.store.feed.subscribe((change) => {
        this.broadcast(change);
      }),
      options.store.feed.subscribeNotices((notice) => {
        if (notice.type === 'transcript_changed')
          this.announce(notice, notice.source === 'camera' ? 'everyone' : 'owners');
        if (notice.type === 'listening_changed') this.announce(notice, 'everyone');
      }),
    ];
    this.heartbeat = setInterval(() => {
      this.beat();
    }, HEARTBEAT_MS);
    options.log.info('live.started', {
      heartbeatMs: HEARTBEAT_MS,
      slowClientBytes: SLOW_CLIENT_BYTES,
    });
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const client = socketClient(this.options.store, request, LIVE_PROTOCOL, '/live');
    this.options.log.debug('live.authenticated', () => ({
      clientId: client.id,
      role: client.role,
      remote: remoteKind(request.socket.remoteAddress),
    }));
    this.server.handleUpgrade(request, socket, head, (ws) => {
      this.accept(client, ws, request);
    });
  }

  connectedClients(): ReadonlySet<string> {
    return new Set(
      [...this.connections]
        .filter((connection) => !this.backgrounds.has(connection))
        .map((connection) => connection.client.id),
    );
  }

  backgroundClients(): ReadonlySet<string> {
    return new Set(
      [...this.connections]
        .filter((connection) => this.backgrounds.has(connection))
        .map((connection) => connection.client.id),
    );
  }

  async deliver(clientId: string, notice: LiveNotice): Promise<number> {
    const startedAt = performance.now();
    const own = [...this.connections].filter((connection) => connection.client.id === clientId);
    const reached = await Promise.all(
      own.map(async (connection): Promise<boolean> => {
        if (!(await answersPing(connection.socket, LIVENESS_PROBE_MS))) {
          connection.stats.closedBy('hub:probe_unanswered');
          this.options.log.warn('live.connection_unresponsive', {
            clientId,
            socketId: connection.id,
            probeMs: LIVENESS_PROBE_MS,
            openMs: Math.round(performance.now() - connection.openedAt),
            noticeType: notice.type,
          });
          return false;
        }
        this.send(connection, notice);
        return true;
      }),
    );
    const delivered = reached.filter(Boolean).length;
    this.options.log.debug('live.delivered', () => ({
      clientId,
      noticeType: notice.type,
      sockets: own.length,
      delivered,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return delivered;
  }

  presence(): void {
    this.announce({ type: 'presence', hub: this.options.status() }, 'everyone');
  }

  firewall(status: FirewallStatus): void {
    this.announce({ type: 'firewall', firewall: status }, 'everyone');
  }

  announce(notice: LiveNotice, audience: LiveAudience): void {
    for (const connection of this.connections) {
      if (hears(connection, audience)) {
        this.send(connection, notice);
      }
    }
  }

  toClient(clientId: string, notice: LiveNotice): void {
    for (const connection of this.connections) {
      if (connection.client.id === clientId) {
        this.send(connection, notice);
      }
    }
  }

  profileChanged(clientId: string, profileId: string): void {
    for (const connection of this.connections) {
      if (connection.client.id === clientId) {
        this.send(connection, { type: 'profile_changed', profileId });
      }
    }
  }

  prime(stream: LiveStream, primer: (profileId: string) => readonly LiveNotice[]): void {
    this.primers.set(stream, primer);
  }

  profileNotice(notice: LiveNotice, profileId: string, audience: LiveAudience): void {
    for (const connection of this.connections) {
      const own = this.options.store.profiles.activeOf(connection.client.id).id === profileId;
      if (own && hears(connection, audience)) {
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
    closeClientSockets(this.connections, this.options.log, clientId, 'withdrawn');
    clientSocketsOf(this.options.store).close(clientId, 'withdrawn');
  }

  reconnectClient(clientId: string): void {
    closeClientSockets(this.connections, this.options.log, clientId, 'access_changed');
    clientSocketsOf(this.options.store).close(clientId, 'access_changed');
  }

  stop(): void {
    this.options.log.info('live.stopping', { sockets: this.connections.size });
    clearInterval(this.heartbeat);
    this.notifications.stop();
    this.unsubscribe.forEach((stop) => {
      stop();
    });
    for (const connection of this.connections) {
      connection.stats.closedBy('hub:shutdown');
      connection.socket.terminate();
    }
    this.server.close();
  }

  private accept(client: ClientRow, socket: WebSocket, request: IncomingMessage): void {
    this.sequence += 1;
    const connection: LiveConnection = {
      client,
      socket,
      tables: new Set(),
      streams: new Set(),
      alive: true,
      id: this.sequence,
      openedAt: performance.now(),
      remote: remoteKind(request.socket.remoteAddress),
      stats: new SocketStats(),
    };
    this.connections.add(connection);
    this.tally.open();
    socket.on('pong', () => {
      connection.alive = true;
      connection.stats.ponged();
    });
    socket.on('message', (data) => {
      this.receive(connection, data);
    });
    socket.once('close', (closeCode: number, reason: Buffer) => {
      this.previewOwners.close(connection);
      this.watches.close(connection);
      this.voice.close(connection);
      this.connections.delete(connection);
      this.tally.close();
      logClosed(this.options.log, connection, { code: closeCode, reason }, this.connections.size);
    });
    socket.on('error', (cause: Error & { code?: string }) => {
      logSocketFailed(this.options.log, connection, cause);
    });
    logConnected(this.options.log, connection, this.connections);
    this.greet(connection);
  }

  private receive(connection: LiveConnection, data: RawData): void {
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : '';
    const read = readSubscribe(text);
    if (read instanceof z.ZodError) {
      connection.stats.closedBy('hub:invalid_message');
      this.options.log.warn('live.message_invalid', {
        socketId: connection.id,
        clientId: connection.client.id,
        issues: issuesOf(read),
        length: text.length,
        binary: !Buffer.isBuffer(data),
        closeCode: POLICY_VIOLATION,
      });
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
    if (read.type === 'watch') this.watches.receive(connection, read);
    else if (read.type === 'voice_levels_watch') this.voice.watch(connection, read.call_id);
    else this.subscribe(connection, read);
  }

  private greet(connection: LiveConnection): void {
    const { client } = connection;
    this.options.log.debug('live.ready_sent', () => ({
      socketId: connection.id,
      clientId: client.id,
      seq: this.options.store.feed.seq,
      sinceOpenMs: Math.round(performance.now() - connection.openedAt),
    }));
    this.send(connection, {
      type: 'ready',
      clientId: client.id,
      role: client.role,
      hub: this.options.status(),
      seq: this.options.store.feed.seq,
    });
    this.voice.snapshot(connection);
  }

  private subscribe(connection: LiveConnection, message: LiveSubscribeMessage): void {
    if (!this.previewOwners.receive(connection, message)) {
      this.options.log.debug('live.subscribe_consumed', {
        socketId: connection.id,
        clientId: connection.client.id,
        messageType: message.type,
      });
      return;
    }
    const requested = splitLiveTables(message.tables);
    if (requested.unknown.length > 0) {
      this.options.log.warn('live.tables_unknown', {
        socketId: connection.id,
        clientId: connection.client.id,
        tables: requested.unknown,
      });
    }
    const tables = allowedTables(connection.client, requested.known);
    const streams = allowedStreams(connection.client, message.streams);
    connection.stats.subscribed();
    this.options.log.info('live.subscribed', {
      socketId: connection.id,
      clientId: connection.client.id,
      role: connection.client.role,
      background: message.background === true,
      tables: tables.length,
      tablesDenied: message.tables.length - tables.length,
      streams,
      streamsDenied: message.streams.length - streams.length,
      subscribes: connection.stats.subscribes,
      seq: this.options.store.feed.seq,
      sinceOpenMs: Math.round(performance.now() - connection.openedAt),
    });
    if (message.background === true) this.backgrounds.add(connection);
    else this.backgrounds.delete(connection);
    connection.tables.clear();
    connection.streams.clear();
    tables.forEach((table) => connection.tables.add(table));
    streams.forEach((stream) => connection.streams.add(stream));
    this.send(connection, {
      type: 'subscribed',
      tables,
      streams,
      seq: this.options.store.feed.seq,
    });
    this.primeConnection(connection);
  }

  private primeConnection(connection: LiveConnection): void {
    const profileId = this.options.store.profiles.activeOf(connection.client.id).id;
    for (const [stream, primer] of this.primers) {
      if (connection.streams.has(stream)) {
        const notices = primer(profileId);
        this.options.log.debug('live.primed', {
          socketId: connection.id,
          clientId: connection.client.id,
          stream,
          notices: notices.length,
        });
        notices.forEach((notice) => {
          this.send(connection, notice);
        });
      }
    }
  }

  private broadcast(change: LiveChange): void {
    for (const connection of this.connections) {
      const shown = projected(connection, change, this.options.store);
      if (shown !== null) this.send(connection, shown);
    }
  }

  private send(connection: LiveConnection, message: LiveMessage): void {
    const buffered = connection.socket.bufferedAmount;
    connection.stats.buffered(buffered);
    if (buffered > SLOW_CLIENT_BYTES) {
      connection.stats.closedBy('hub:client_too_slow');
      logTooSlow(this.options.log, connection, buffered, message.type);
      connection.socket.terminate();
      return;
    }
    watchBacklog(this.options.log, connection, buffered, message.type);
    const text = liveText(connection.client.role, message);
    if (text === null) {
      connection.stats.skipped();
      this.tally.skipped();
      return;
    }
    connection.socket.send(text);
    connection.stats.delivered(text.length);
    this.tally.delivered(message.type, text.length);
  }

  private beat(): void {
    let silent = 0;
    for (const connection of this.connections) {
      if (!connection.alive) {
        silent += 1;
        connection.stats.closedBy('hub:heartbeat_missed');
        logHeartbeatMissed(this.options.log, connection);
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
    this.summarise(silent);
  }

  private summarise(silent: number): void {
    const tally = this.tally;
    this.tally = new LiveTally();
    logSummary(this.options.log, tally, this.connections, {
      silent,
      seq: this.options.store.feed.seq,
    });
  }
}
