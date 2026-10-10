import {
  NUTRITION_METRICS,
  WATCH_METRICS,
  OWNER_TABLES,
  type ClientRow,
  type HealthMetric,
  type LiveChange,
  type LiveStream,
  type LiveTable,
} from '@smarteverything/domain';
import type { WebSocket } from 'ws';

const OWNER_STREAMS: ReadonlySet<LiveStream> = new Set(['service_log', 'claude']);

export interface Connection {
  readonly client: ClientRow;
  readonly socket: WebSocket;
  readonly tables: Set<LiveTable>;
  readonly streams: Set<LiveStream>;
  alive: boolean;
}

export function allowedTables(client: ClientRow, requested: readonly LiveTable[]): LiveTable[] {
  return requested.filter((table) => client.role === 'owner' || !OWNER_TABLES.has(table));
}

export function allowedStreams(client: ClientRow, requested: readonly LiveStream[]): LiveStream[] {
  return requested.filter((stream) => client.role === 'owner' || !OWNER_STREAMS.has(stream));
}

function ownRow(
  connection: Connection,
  row: { readonly client_id?: string | null; readonly profile_id: string | null } | null,
  profileOf: ProfileLookup,
): boolean {
  return (
    row !== null &&
    (row.client_id === connection.client.id || row.profile_id === profileOf(connection.client.id))
  );
}

function newerMetricVisible(connection: Connection, metric: HealthMetric): boolean {
  return (
    (connection.tables.has('health_entries') || !NUTRITION_METRICS.has(metric)) &&
    (connection.tables.has('watch_days') || !WATCH_METRICS.has(metric))
  );
}

function visibleDaily(
  connection: Connection,
  change: LiveChange,
  profileOf: ProfileLookup,
): boolean {
  if (change.table !== 'health_daily') {
    return true;
  }
  const row = change.record ?? change.oldRecord;
  return (
    ownRow(connection, row, profileOf) &&
    (row === null || newerMetricVisible(connection, row.metric))
  );
}

function visibleUsage(
  connection: Connection,
  row: { readonly client_id: string | null; readonly profile_id: string } | null,
  profileOf: ProfileLookup,
): boolean {
  return connection.client.role === 'owner' || ownRow(connection, row, profileOf);
}

const PROFILE_ROW_TABLES: ReadonlySet<LiveTable> = new Set([
  'layouts',
  'health_entries',
  'foods',
  'watch_days',
  'assistant_messages',
  'ai_chats',
  'ai_outreach',
]);

type ProfileScoped = Extract<
  LiveChange,
  {
    table:
      | 'layouts'
      | 'health_entries'
      | 'foods'
      | 'watch_days'
      | 'assistant_messages'
      | 'ai_chats'
      | 'ai_outreach';
  }
>;

function profileScoped(change: LiveChange): change is ProfileScoped {
  return PROFILE_ROW_TABLES.has(change.table);
}

export function visible(
  connection: Connection,
  change: LiveChange,
  profileOf: ProfileLookup,
): boolean {
  if (!connection.tables.has(change.table)) {
    return false;
  }
  if (profileScoped(change)) {
    return ownRow(connection, change.record ?? change.oldRecord, profileOf);
  }
  if (change.table === 'ai_usage') {
    return visibleUsage(connection, change.record ?? change.oldRecord, profileOf);
  }
  return visibleDaily(connection, change, profileOf);
}

export type ProfileLookup = (clientId: string) => string;
