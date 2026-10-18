import { Logger, passesThreshold } from '@smarteverything/logging';
import type { Connection } from './live-visibility';
import type { LiveTally, SocketStats } from './live-stats';

export interface LoggedConnection extends Connection {
  readonly id: number;
  readonly openedAt: number;
  readonly remote: string;
  readonly stats: SocketStats;
}

export const HEARTBEAT_MS = 30_000;
export const SLOW_CLIENT_BYTES = 8 * 1024 * 1024;
const BACKLOG_WARN_BYTES = 1024 * 1024;
const BACKLOG_CLEARED_BYTES = 64 * 1024;

function openMs(connection: LoggedConnection): number {
  return Math.round(performance.now() - connection.openedAt);
}

export function logConnected(
  log: Logger,
  connection: LoggedConnection,
  all: ReadonlySet<LoggedConnection>,
): void {
  log.info('live.connected', {
    socketId: connection.id,
    clientId: connection.client.id,
    role: connection.client.role,
    remote: connection.remote,
    protocol: connection.socket.protocol,
    sockets: all.size,
    clientSockets: [...all].filter((one) => one.client.id === connection.client.id).length,
  });
}

export function logClosed(
  log: Logger,
  connection: LoggedConnection,
  close: { readonly code: number; readonly reason: Buffer },
  remaining: number,
): void {
  const { stats } = connection;
  log.info('live.closed', {
    socketId: connection.id,
    clientId: connection.client.id,
    role: connection.client.role,
    remote: connection.remote,
    closeCode: close.code,
    reason: close.reason.toString('utf8').slice(0, 120),
    closedBy: stats.closer ?? 'client_or_network',
    openMs: openMs(connection),
    greeted: stats.subscribes > 0,
    subscribes: stats.subscribes,
    sent: stats.sent,
    sentChars: stats.sentChars,
    filtered: stats.filtered,
    maxBufferedBytes: stats.maxBuffered,
    sinceLastPongMs: stats.sinceLastPongMs(),
    remaining,
  });
}

export function logSocketFailed(
  log: Logger,
  connection: LoggedConnection,
  cause: Error & { code?: string },
): void {
  log.warn('live.socket_failed', {
    socketId: connection.id,
    clientId: connection.client.id,
    reason: cause.message,
    errorCode: cause.code ?? null,
    openMs: openMs(connection),
  });
}

export function logTooSlow(
  log: Logger,
  connection: LoggedConnection,
  buffered: number,
  noticeType: string,
): void {
  log.warn('live.client_too_slow', {
    socketId: connection.id,
    clientId: connection.client.id,
    bufferedBytes: buffered,
    limitBytes: SLOW_CLIENT_BYTES,
    noticeType,
    openMs: openMs(connection),
    sent: connection.stats.sent,
  });
}

export function watchBacklog(
  log: Logger,
  connection: LoggedConnection,
  buffered: number,
  noticeType: string,
): void {
  const { stats } = connection;
  if (!stats.backlogged && buffered > BACKLOG_WARN_BYTES) {
    stats.backlog(true);
    log.warn('live.backpressure', {
      socketId: connection.id,
      clientId: connection.client.id,
      bufferedBytes: buffered,
      warnBytes: BACKLOG_WARN_BYTES,
      dropAtBytes: SLOW_CLIENT_BYTES,
      noticeType,
      sent: stats.sent,
    });
  } else if (stats.backlogged && buffered < BACKLOG_CLEARED_BYTES) {
    stats.backlog(false);
    log.info('live.backpressure_cleared', {
      socketId: connection.id,
      clientId: connection.client.id,
      bufferedBytes: buffered,
    });
  }
}

export function logHeartbeatMissed(log: Logger, connection: LoggedConnection): void {
  log.warn('live.heartbeat_missed', {
    socketId: connection.id,
    clientId: connection.client.id,
    sinceLastPongMs: connection.stats.sinceLastPongMs(),
    heartbeatMs: HEARTBEAT_MS,
    bufferedBytes: connection.socket.bufferedAmount,
    openMs: openMs(connection),
  });
}

export function logSummary(
  log: Logger,
  tally: LiveTally,
  connections: ReadonlySet<LoggedConnection>,
  window: { readonly silent: number; readonly seq: number },
): void {
  if (!passesThreshold('debug', Logger.level)) return;
  if (connections.size === 0 && tally.opened === 0 && tally.closed === 0) return;
  let buffered = 0;
  for (const connection of connections) buffered += connection.socket.bufferedAmount;
  log.debug('live.summary', () => ({
    windowMs: HEARTBEAT_MS,
    sockets: connections.size,
    owners: [...connections].filter((one) => one.client.role === 'owner').length,
    opened: tally.opened,
    closed: tally.closed,
    silentClosed: window.silent,
    sent: tally.sent,
    sentChars: tally.chars,
    filtered: tally.filtered,
    bufferedBytes: buffered,
    seq: window.seq,
    types: Object.fromEntries(tally.types),
  }));
}
