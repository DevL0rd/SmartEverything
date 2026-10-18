import {
  NUTRITION_METRICS,
  WATCH_METRICS,
  OWNER_TABLES,
  type BodyReadingRow,
  type ClientRow,
  type DeviceRow,
  type EventRow,
  type HistoryRow,
  type HealthMetric,
  type LiveChange,
  type LiveStream,
  type LiveTable,
  type StateRow,
} from '@smarteverything/domain';
import type { WebSocket } from 'ws';
import { hiddenComputer, viewerOfClient } from '../computers/computer-access';
import { phoneViewerOfClient } from '../phones/phone-detail';
import { otherPhoneTiers, phoneEventOf, valueHiddenByTier } from '../phones/phone-visibility';
import type { Store } from '../store/store';
import { hiddenByAccess } from './live-access';
import { profileSeenBy, readingVisibleTo, type Viewer } from './person-privacy';

const OWNER_STREAMS: ReadonlySet<LiveStream> = new Set(['service_log', 'claude']);

export interface Connection {
  readonly client: ClientRow;
  readonly socket: WebSocket;
  readonly tables: Set<LiveTable>;
  readonly streams: Set<LiveStream>;
  alive: boolean;
}

export type Hearing = Pick<Connection, 'client' | 'tables'>;

export function allowedTables(client: ClientRow, requested: readonly LiveTable[]): LiveTable[] {
  return requested.filter((table) => client.role === 'owner' || !OWNER_TABLES.has(table));
}

export function allowedStreams(client: ClientRow, requested: readonly LiveStream[]): LiveStream[] {
  return requested.filter((stream) => client.role === 'owner' || !OWNER_STREAMS.has(stream));
}

function ownRow(
  connection: Hearing,
  row: { readonly client_id?: string | null; readonly profile_id: string | null } | null,
  profileOf: ProfileLookup,
): boolean {
  return (
    row !== null &&
    (row.client_id === connection.client.id || row.profile_id === profileOf(connection.client.id))
  );
}

function newerMetricVisible(connection: Hearing, metric: HealthMetric): boolean {
  return (
    (connection.tables.has('health_entries') || !NUTRITION_METRICS.has(metric)) &&
    (connection.tables.has('watch_days') || !WATCH_METRICS.has(metric))
  );
}

function visibleDaily(connection: Hearing, change: LiveChange, profileOf: ProfileLookup): boolean {
  if (change.table !== 'health_daily') {
    return true;
  }
  const row = change.record ?? change.oldRecord;
  return (
    ownRow(connection, row, profileOf) &&
    (row === null || newerMetricVisible(connection, row.metric))
  );
}

function viewerOf(connection: Hearing, store: LiveStore): Viewer {
  return {
    role: connection.client.role,
    profileId: store.profiles.activeOf(connection.client.id).id,
  };
}

function bodyReadingVisible(
  connection: Hearing,
  change: Extract<LiveChange, { table: 'body_readings' }>,
  store: LiveStore,
): boolean {
  const viewer = viewerOf(connection, store);
  return [change.record, change.oldRecord].some(
    (row) => row !== null && readingVisibleTo(viewer, row),
  );
}

function visibleUsage(
  connection: Hearing,
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

function hiddenDevice(connection: Hearing, row: DeviceRow | null, store: LiveStore): boolean {
  return (
    connection.client.role !== 'owner' &&
    row !== null &&
    hiddenComputer(store, viewerOfClient(store, connection.client), row)
  );
}

function hiddenValue(connection: Hearing, row: StateRow | HistoryRow, store: LiveStore): boolean {
  const device = store.devices.find(row.device_id);
  if (device === undefined) return false;
  const tiers = otherPhoneTiers([device], phoneViewerOfClient(store, connection.client));
  return valueHiddenByTier(tiers, row) || hiddenDevice(connection, device, store);
}

function eventShown(connection: Hearing, row: EventRow | null, store: LiveStore): EventRow | null {
  const deviceId = row?.device_id ?? null;
  if (row === null || deviceId === null) return row;
  const device = store.devices.find(deviceId);
  if (device === undefined) return row;
  const tiers = otherPhoneTiers([device], phoneViewerOfClient(store, connection.client));
  return phoneEventOf(tiers, row);
}

function hiddenEvent(
  connection: Hearing,
  change: Extract<LiveChange, { table: 'events' }>,
  store: LiveStore,
): boolean {
  const row = change.record ?? change.oldRecord;
  return row !== null && eventShown(connection, row, store) === null;
}

function seenProfileChange(
  connection: Hearing,
  change: Extract<LiveChange, { table: 'profiles' }>,
  store: LiveStore,
): LiveChange {
  const viewer = viewerOf(connection, store);
  return {
    ...change,
    record: change.record === null ? null : profileSeenBy(viewer, change.record),
    oldRecord: change.oldRecord === null ? null : profileSeenBy(viewer, change.oldRecord),
  };
}

function seenReadingChange(
  connection: Hearing,
  change: Extract<LiveChange, { table: 'body_readings' }>,
  store: LiveStore,
): LiveChange {
  const viewer = viewerOf(connection, store);
  const shown = (row: BodyReadingRow | null): BodyReadingRow | null =>
    row !== null && readingVisibleTo(viewer, row) ? row : null;
  return { ...change, record: shown(change.record), oldRecord: shown(change.oldRecord) };
}

function seenEventChange(
  connection: Hearing,
  change: Extract<LiveChange, { table: 'events' }>,
  store: LiveStore,
): LiveChange {
  return {
    ...change,
    record: eventShown(connection, change.record, store),
    oldRecord: eventShown(connection, change.oldRecord, store),
  };
}

export function projected(
  connection: Hearing,
  change: LiveChange,
  store: LiveStore,
): LiveChange | null {
  if (!visible(connection, change, store)) return null;
  if (change.table === 'profiles') return seenProfileChange(connection, change, store);
  if (change.table === 'body_readings') return seenReadingChange(connection, change, store);
  if (change.table === 'events') return seenEventChange(connection, change, store);
  return change;
}

function hiddenChange(connection: Hearing, change: LiveChange, store: LiveStore): boolean {
  if (change.table === 'devices') {
    return hiddenDevice(connection, change.record ?? change.oldRecord, store);
  }
  if (change.table === 'events' && hiddenEvent(connection, change, store)) return true;
  if (change.table !== 'device_state' && change.table !== 'state_history') return false;
  const row = change.record ?? change.oldRecord;
  return row !== null && hiddenValue(connection, row, store);
}

export type LiveStore = Pick<
  Store,
  'devices' | 'computerNodes' | 'profiles' | 'personAccess' | 'infrared'
>;

export function visible(connection: Hearing, change: LiveChange, store: LiveStore): boolean {
  if (
    !connection.tables.has(change.table) ||
    hiddenChange(connection, change, store) ||
    hiddenByAccess(connection, change, store)
  ) {
    return false;
  }
  const profileOf: ProfileLookup = (clientId) => store.profiles.activeOf(clientId).id;
  if (profileScoped(change)) {
    return ownRow(connection, change.record ?? change.oldRecord, profileOf);
  }
  if (change.table === 'body_readings') {
    return bodyReadingVisible(connection, change, store);
  }
  if (change.table === 'ai_usage') {
    return visibleUsage(connection, change.record ?? change.oldRecord, profileOf);
  }
  return visibleDaily(connection, change, profileOf);
}

type ProfileLookup = (clientId: string) => string;
