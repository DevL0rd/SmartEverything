import { hears, readSubscribe } from './live-subscribe';
import { clientSocketsOf } from './client-sockets';
import { LiveVoice } from './live-voice';
import { LiveWatch } from './live-watch';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  DRIVE_NOTICE_TYPES,
  LIVE_HEARTBEAT_MS,
  LIVE_PROTOCOL,
  LIVE_PROTOCOL_MISMATCH,
  type ClientRow,
  type FirewallStatus,
  type HubStatus,
  type LiveChange,
  type LiveSubscribeMessage,
  type LiveMessage,
  type LiveStream,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import {
  SLOW_CLIENT_BYTES,
  logClosed,
  logConnected,
  logHeartbeatMissed,
  logSocketFailed,
  logSummary,
  type LoggedConnection,
} from './live-log';
import { LiveTally, SocketStats } from './live-stats';
import { requestRemoteKind } from './request-trace';
import { closeClientSockets } from './live-closing';
import { chosenLiveProtocol, mismatchedLiveProtocol } from './live-protocol';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { z } from 'zod';
import type { Store } from '../store/store';
import { socketClient } from './socket-auth';
import { issuesOf } from './issues';
import { viewedByStore } from './live-visibility';
import { LiveOutbound, type OutboundKind } from './live-outbound';
import type { LiveViewOf } from './live-views';
import {
  applySubscription,
  type ClientPrimer,
  type LivePrimer,
  type LiveSubscription,
} from './live-subscription';
import { ConnectionHeartbeat } from '../network/connection-heartbeat';
import { pingWhenOpen } from '../network/guarded-socket';
import { answering } from './live-reach';
import { LiveNotifications } from './live-notifications';
import { AppViewBroker } from '../app-view/broker';

export type LiveNotice = Exclude<LiveMessage, { type: 'change' | 'ready' | 'subscribed' }>;

const POLICY_VIOLATION = 1008;
const DRIVE_NOTICES: ReadonlySet<string> = new Set(DRIVE_NOTICE_TYPES);
type LiveConnection = LoggedConnection;

export type LiveAudience = 'everyone' | 'owners' | LiveStream;

export type LiveReach = 'any' | 'foreground';

export interface LiveOptions {
  readonly store: Store;
  readonly status: () => HubStatus;
  readonly log: Logger;
}

export class LiveHub {
  private readonly server = new WebSocketServer({
    noServer: true,
    handleProtocols: chosenLiveProtocol,
  });
  readonly watches: LiveWatch<LiveConnection>;
  readonly voice: LiveVoice<LiveConnection>;
  readonly notifications: LiveNotifications;
  readonly appViews: AppViewBroker;
  private readonly connections = new Set<LiveConnection>();
  private readonly backgrounds = new WeakSet<LiveConnection>();
  private tally = new LiveTally();
  private sequence = 0;
  private readonly primers = new Map<LiveStream, LivePrimer>();
  readonly clientPrimers = new Set<ClientPrimer>();
  private readonly subscription: LiveSubscription;
  private readonly heartbeat = new ConnectionHeartbeat(LIVE_HEARTBEAT_MS, () => this.beat());
  private readonly unsubscribe: readonly (() => void)[];
  private readonly outbound: LiveOutbound<LiveConnection>;

  constructor(private readonly options: LiveOptions) {
    this.outbound = new LiveOutbound({
      views: (input): Promise<LiveViewOf[][]> => options.store.host.read('liveViews', input),
      tally: (): LiveTally => this.tally,
      log: options.log,
    });
    this.subscription = {
      store: options.store,
      log: options.log,
      backgrounds: this.backgrounds,
      primers: this.primers,
      clientPrimers: this.clientPrimers,
      send: this.send.bind(this),
    };
    this.watches = new LiveWatch({
      send: this.send.bind(this),
      sendTrace: this.send.bind(this),
      log: options.log,
    });
    this.notifications = new LiveNotifications(
      (clientId, notice) => this.deliver(clientId, notice),
      options.log,
    );
    this.appViews = new AppViewBroker(
      (clientId, notice) => this.deliver(clientId, notice, 'foreground'),
      options.log,
    );
    this.voice = new LiveVoice({
      send: this.send.bind(this),
      profileOf: (clientId): Promise<string> => options.store.host.read('activeProfile', clientId),
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
        if (notice.type === 'ai_subscription_usage_changed')
          this.profileNotice(notice, notice.profile_id, 'assistant');
        if (DRIVE_NOTICES.has(notice.type)) this.driveNotice(notice);
      }),
    ];
    options.log.info('live.started', {
      heartbeatMs: LIVE_HEARTBEAT_MS,
      slowClientBytes: SLOW_CLIENT_BYTES,
    });
  }

  async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const offered = mismatchedLiveProtocol(request);
    if (offered !== null) {
      this.options.log.warn('live.protocol_mismatch', { offered, expected: LIVE_PROTOCOL });
      this.server.handleUpgrade(request, socket, head, (ws) => {
        ws.close(LIVE_PROTOCOL_MISMATCH.code, LIVE_PROTOCOL_MISMATCH.reason);
      });
      return;
    }
    const client = await socketClient(this.options.store, request, LIVE_PROTOCOL, '/live');
    this.options.log.debug('live.authenticated', () => ({
      clientId: client.id,
      role: client.role,
      remote: requestRemoteKind(request),
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

  async deliver(clientId: string, notice: LiveNotice, reach: LiveReach = 'any'): Promise<number> {
    const startedAt = performance.now();
    const own = [...this.connections].filter(
      (connection) =>
        connection.client.id === clientId && (reach === 'any' || !this.backgrounds.has(connection)),
    );
    const alive = await answering(own, this.options.log, notice.type);
    const chosen = this.chosen(alive);
    const reached = chosen === undefined ? [] : [chosen];
    reached.forEach((connection) => {
      this.send(connection, notice);
    });
    this.options.log.debug('live.delivered', () => ({
      clientId,
      noticeType: notice.type,
      reach,
      sockets: own.length,
      alive: alive.length,
      delivered: reached.length,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    return reached.length;
  }

  private chosen(connections: readonly LiveConnection[]): LiveConnection | undefined {
    const rank = (connection: LiveConnection): number =>
      (this.backgrounds.has(connection) ? 0 : 1e15) + connection.openedAt;
    return connections.reduce<LiveConnection | undefined>(
      (best, connection) =>
        best === undefined || rank(connection) > rank(best) ? connection : best,
      undefined,
    );
  }

  presence(): void {
    this.announce({ type: 'presence', hub: this.options.status() }, 'everyone');
  }

  firewall(status: FirewallStatus): void {
    this.announce({ type: 'firewall', firewall: status }, 'everyone');
  }

  announce(notice: LiveNotice, audience: LiveAudience): void {
    this.outbound.enqueue(
      [...this.connections].filter((connection) => hears(connection, audience)),
      this.messageJob(notice),
    );
  }

  private driveNotice(notice: LiveNotice): void {
    this.outbound.enqueue(
      [...this.connections].filter((connection) => !this.backgrounds.has(connection)),
      { kind: 'drive', message: notice },
    );
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

  prime(stream: LiveStream, primer: LivePrimer): void {
    this.primers.set(stream, primer);
  }

  profileNotice(notice: LiveNotice, profileId: string, audience: LiveAudience): void {
    this.outbound.enqueue(
      [...this.connections].filter((connection) => hears(connection, audience)),
      { kind: 'profile', message: notice, profileId },
    );
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
    this.heartbeat.stop();
    this.notifications.stop();
    this.appViews.stop();
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
      remote: requestRemoteKind(request),
      stats: new SocketStats(),
    };
    this.connections.add(connection);
    this.heartbeat.start();
    this.tally.open();
    socket.on('pong', () => {
      connection.alive = true;
      connection.stats.ponged();
    });
    socket.on('message', (data) => {
      this.receive(connection, data);
    });
    socket.once('close', (closeCode: number, reason: Buffer) => {
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
    else if (read.type === 'watch_automations') this.watches.receiveTrace(connection, read);
    else if (read.type === 'voice_levels_watch')
      background(this.voice.watch(connection, read.call_id), 'live.voice_watch_failed', {
        socketId: connection.id,
      });
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
    background(this.voice.snapshot(connection), 'live.voice_snapshot_failed', {
      socketId: connection.id,
    });
  }

  private subscribe(connection: LiveConnection, message: LiveSubscribeMessage): void {
    background(applySubscription(this.subscription, connection, message), 'live.subscribe_failed', {
      socketId: connection.id,
      clientId: connection.client.id,
    });
  }

  private broadcast(change: LiveChange): void {
    const viewed = this.options.store.live.pluginStreams.viewersOf(change);
    this.outbound.enqueue(
      [...this.connections].filter(
        (connection) =>
          connection.tables.has(change.table) &&
          (viewed === null || this.watches.watches(connection, viewed)),
      ),
      { kind: 'change', change },
    );
  }

  private send(connection: LiveConnection, message: LiveMessage): void {
    this.outbound.enqueue([connection], this.messageJob(message));
  }

  private messageJob(message: LiveMessage): OutboundKind {
    return viewedByStore(message) ? { kind: 'seen', message } : { kind: 'direct', message };
  }

  private beat(): boolean {
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
      pingWhenOpen(connection.socket);
    }
    this.summarise(silent);
    return this.connections.size > 0;
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
