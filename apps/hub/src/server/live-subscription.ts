import {
  splitLiveTables,
  type ClientRow,
  type LiveMessage,
  type LiveStream,
  type LiveSubscribeMessage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { LiveNotice } from './live';
import type { LoggedConnection } from './live-log';
import { allowedStreams, allowedTables } from './live-visibility';

export type LivePrimer = (profileId: string) => readonly LiveNotice[];

export type ClientPrimer = (client: ClientRow) => readonly LiveNotice[];

export interface LiveSubscription {
  readonly store: Store;
  readonly log: Logger;
  readonly backgrounds: WeakSet<LoggedConnection>;
  readonly primers: ReadonlyMap<LiveStream, LivePrimer>;
  readonly clientPrimers: ReadonlySet<ClientPrimer>;
  readonly send: (connection: LoggedConnection, message: LiveMessage) => void;
}

export async function applySubscription(
  context: LiveSubscription,
  connection: LoggedConnection,
  message: LiveSubscribeMessage,
): Promise<void> {
  const { log, store } = context;
  const requested = splitLiveTables(message.tables);
  if (requested.unknown.length > 0) {
    log.warn('live.tables_unknown', {
      socketId: connection.id,
      clientId: connection.client.id,
      tables: requested.unknown,
    });
  }
  const tables = allowedTables(connection.client, requested.known);
  const streams = allowedStreams(connection.client, message.streams);
  connection.stats.subscribed();
  log.info('live.subscribed', {
    socketId: connection.id,
    clientId: connection.client.id,
    role: connection.client.role,
    background: message.background === true,
    tables: tables.length,
    tablesDenied: message.tables.length - tables.length,
    streams,
    streamsDenied: message.streams.length - streams.length,
    subscribes: connection.stats.subscribes,
    seq: store.feed.seq,
    sinceOpenMs: Math.round(performance.now() - connection.openedAt),
  });
  if (message.background === true) context.backgrounds.add(connection);
  else context.backgrounds.delete(connection);
  connection.tables.clear();
  connection.streams.clear();
  tables.forEach((table) => connection.tables.add(table));
  streams.forEach((stream) => connection.streams.add(stream));
  context.send(connection, { type: 'subscribed', tables, streams, seq: store.feed.seq });
  await primeConnection(context, connection);
  primeClient(context, connection);
}

function primeClient(context: LiveSubscription, connection: LoggedConnection): void {
  for (const primer of context.clientPrimers) {
    primer(connection.client).forEach((notice) => {
      context.send(connection, notice);
    });
  }
}

async function primeConnection(
  context: LiveSubscription,
  connection: LoggedConnection,
): Promise<void> {
  if (![...context.primers.keys()].some((stream) => connection.streams.has(stream))) return;
  const profileId = await context.store.host.read('activeProfile', connection.client.id);
  for (const [stream, primer] of context.primers) {
    if (connection.streams.has(stream)) {
      const notices = primer(profileId);
      context.log.debug('live.primed', {
        socketId: connection.id,
        clientId: connection.client.id,
        stream,
        notices: notices.length,
      });
      notices.forEach((notice) => {
        context.send(connection, notice);
      });
    }
  }
}
