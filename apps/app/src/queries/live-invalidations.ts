import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { AiChatRow, HistoryRow, LiveChange, LiveTable } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import { patchCameraDays, refreshSnapshots } from './camera-day';
import { invalidateDeviceLogs } from './device-log';
import { entryChanges } from './health-entries';
import {
  ACCESS_PREFIX,
  AI_USAGE_PREFIX,
  AGENT_RUN_PREFIX,
  ARCHIVED_CHATS_KEY,
  DEVICE_EFFECTS_KEY,
  HEALTH_PREFIX,
  HISTORY_PREFIX,
  nativeSessionsKey,
  OPENROUTER_ACCOUNT_KEY,
  PLUGIN_PREFIX,
  REACH_PREFIX,
  WINDOW_PREFIX,
} from './keys';

const log = new Logger('app.queries');
const applied = new LogTally(log, 'windows.summarised', 5000);

const HISTORY_KEY = z.tuple(
  [z.literal('window'), z.literal('history'), z.string(), z.number()],
  z.string(),
);

function appendHistory(client: QueryClient, row: HistoryRow): void {
  for (const query of client.getQueryCache().findAll({ queryKey: HISTORY_PREFIX })) {
    const key = HISTORY_KEY.safeParse(query.queryKey);
    if (
      key.success &&
      key.data[2].split(',').includes(row.capability) &&
      (key.data[4] === undefined || key.data[4] === row.device_id)
    ) {
      client.setQueryData<HistoryRow[]>(query.queryKey, (rows) =>
        rows === undefined ? rows : [...rows, row],
      );
    }
  }
}

const HEALTH_TABLES: ReadonlySet<LiveTable> = new Set([
  'health_daily',
  'health_sources',
  'health_entries',
  'foods',
  'watch_days',
]);

function continuedDevice(chat: AiChatRow | null): string | null {
  return chat?.engine.kind === 'claude' && chat.engine.continued_from !== undefined
    ? chat.engine.device_id
    : null;
}

function invalidateContinuedSessions(client: QueryClient, changes: readonly LiveChange[]): void {
  const devices = new Set<string>();
  for (const change of changes) {
    if (change.table !== 'ai_chats') continue;
    const before = change.oldRecord;
    const after = change.record;
    const removed = after === null;
    const archivedChanged =
      before !== null &&
      after !== null &&
      (before.archived_at === null) !== (after.archived_at === null);
    if (!removed && !archivedChanged) continue;
    const device = continuedDevice(before ?? after);
    if (device !== null) devices.add(device);
  }
  for (const device of devices)
    background(
      client.invalidateQueries({ queryKey: nativeSessionsKey(device, false) }),
      'queries.invalidate_failed',
    );
}

function invalidateAi(client: QueryClient, tables: ReadonlySet<LiveTable>): void {
  if (tables.has('ai_usage')) {
    background(
      client.invalidateQueries({ queryKey: AI_USAGE_PREFIX }),
      'queries.invalidate_failed',
    );
    background(
      client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY }),
      'queries.invalidate_failed',
    );
  }
  if (tables.has('ai_chats')) {
    background(
      client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'window' &&
          query.queryKey[1] === 'computer-ai' &&
          query.queryKey[3] === 'cli-sessions',
      }),
      'queries.invalidate_failed',
    );
    background(
      client.invalidateQueries({ queryKey: AGENT_RUN_PREFIX }),
      'queries.invalidate_failed',
    );
    background(
      client.invalidateQueries({ queryKey: ARCHIVED_CHATS_KEY }),
      'queries.invalidate_failed',
    );
  }
  if (tables.has('ai_outreach')) {
    background(client.invalidateQueries({ queryKey: REACH_PREFIX }), 'queries.invalidate_failed');
  }
}

function invalidateAccess(client: QueryClient, tables: ReadonlySet<LiveTable>): void {
  if (tables.has('profiles') || tables.has('clients')) {
    background(client.invalidateQueries({ queryKey: ACCESS_PREFIX }), 'queries.invalidate_failed');
  }
}

export function refreshDeviceEffects(client: QueryClient): void {
  background(client.cancelQueries({ queryKey: DEVICE_EFFECTS_KEY }), 'queries.cancel_failed');
  background(
    client.invalidateQueries({ queryKey: DEVICE_EFFECTS_KEY }),
    'queries.invalidate_failed',
  );
}

export function applyToWindows(client: QueryClient, changes: readonly LiveChange[]): void {
  const tables = new Set<LiveTable>();
  applied.bump('batches');
  for (const change of changes) {
    tables.add(change.table);
    applied.bump(`change.${change.table}`);
    if (
      change.table === 'state_history' &&
      change.record !== null &&
      change.operation === 'INSERT'
    ) {
      appendHistory(client, change.record);
    }
  }
  if ([...tables].some((table) => HEALTH_TABLES.has(table))) {
    background(client.invalidateQueries({ queryKey: HEALTH_PREFIX }), 'queries.invalidate_failed');
  }
  invalidateAi(client, tables);
  invalidateContinuedSessions(client, changes);
  if (tables.has('device_effect_targets')) {
    refreshDeviceEffects(client);
  }
  if (tables.has('plugins')) {
    background(client.invalidateQueries({ queryKey: PLUGIN_PREFIX }), 'queries.invalidate_failed');
  }
  invalidateAccess(client, tables);
  if (tables.has('health_entries')) {
    entryChanges.update((count) => count + 1);
  }
  invalidateDeviceLogs(client, changes);
  patchCameraDays(client, changes);
  refreshSnapshots(client, changes);
}

export function refreshAllWindows(client: QueryClient): void {
  log.info('windows.refreshed', { queries: client.getQueryCache().getAll().length });
  background(client.invalidateQueries({ queryKey: WINDOW_PREFIX }), 'queries.invalidate_failed');
}
