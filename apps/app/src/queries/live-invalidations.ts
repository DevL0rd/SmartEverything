import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { HistoryRow, LiveChange, LiveTable, LiveWireChange } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';
import { applyHomeMapChanges } from '../features/home-map/data/live';
import { applyDriveChanges } from '../features/drive';
import { patchCameraDays, refreshSnapshots } from './camera-day';
import { refreshAiUsageSoon } from './ai-usage-refresh';
import { invalidateChatMeterHistory } from './chat-meter-history';
import { invalidateDeviceLogs } from './device-log';
import { entryChanges } from './health-entries';
import {
  ACCESS_PREFIX,
  AGENT_RUN_PREFIX,
  ARCHIVED_CHATS_KEY,
  DEVICE_EFFECTS_KEY,
  HEALTH_PREFIX,
  HISTORY_PREFIX,
  PLUGIN_PREFIX,
  plannerKeys,
  type PlannerKind,
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

const PLANNER_DEPENDENTS: Readonly<Record<PlannerKind, readonly LiveTable[]>> = {
  day: [
    'planner_items',
    'planner_occurrences',
    'planner_collections',
    'planner_alarms',
    'planner_timers',
    'planner_guests',
    'planner_collection_shares',
    'google_accounts',
  ],
  range: [
    'planner_items',
    'planner_occurrences',
    'planner_collections',
    'planner_guests',
    'planner_collection_shares',
    'google_accounts',
  ],
  stats: [
    'planner_items',
    'planner_occurrences',
    'planner_collections',
    'planner_alarms',
    'planner_timers',
  ],
  rings: ['planner_alarms', 'planner_timers'],
  search: [
    'planner_items',
    'planner_occurrences',
    'planner_collections',
    'planner_guests',
    'planner_collection_shares',
  ],
};

const PLANNER_KINDS: readonly PlannerKind[] = ['day', 'range', 'stats', 'rings', 'search'];

export function plannerKindsChanged(tables: ReadonlySet<LiveTable>): readonly PlannerKind[] {
  return PLANNER_KINDS.filter((kind) =>
    PLANNER_DEPENDENTS[kind].some((table) => tables.has(table)),
  );
}

function invalidatePlanner(client: QueryClient, tables: ReadonlySet<LiveTable>): void {
  for (const kind of plannerKindsChanged(tables)) {
    background(
      client.invalidateQueries({ queryKey: plannerKeys.prefix(kind) }),
      'queries.invalidate_failed',
    );
  }
}

function invalidateAi(client: QueryClient, tables: ReadonlySet<LiveTable>): void {
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

export function applyToWindows(
  client: QueryClient,
  changes: readonly LiveChange[],
  frames: readonly LiveWireChange[],
): void {
  const tables = new Set<LiveTable>();
  applied.bump('batches');
  for (const frame of frames) {
    tables.add(frame.table);
    applied.bump(`change.${frame.table}`);
    if (frame.table === 'state_history' && frame.operation === 'INSERT') {
      appendHistory(client, frame.record);
    }
  }
  if ([...tables].some((table) => HEALTH_TABLES.has(table))) {
    background(client.invalidateQueries({ queryKey: HEALTH_PREFIX }), 'queries.invalidate_failed');
  }
  invalidateAi(client, tables);
  refreshAiUsageSoon(client, frames);
  invalidateChatMeterHistory(client, changes, frames);
  if (tables.has('device_effect_targets')) {
    refreshDeviceEffects(client);
  }
  if (tables.has('plugins')) {
    background(client.invalidateQueries({ queryKey: PLUGIN_PREFIX }), 'queries.invalidate_failed');
  }
  invalidateAccess(client, tables);
  invalidatePlanner(client, tables);
  if (tables.has('health_entries')) {
    entryChanges.update((count) => count + 1);
  }
  invalidateDeviceLogs(client, changes);
  patchCameraDays(client, changes);
  refreshSnapshots(client, changes);
  applyHomeMapChanges(client, frames);
  applyDriveChanges(client, changes);
}

export function refreshAllWindows(client: QueryClient): void {
  log.info('windows.refreshed', { queries: client.getQueryCache().getAll().length });
  background(client.invalidateQueries({ queryKey: WINDOW_PREFIX }), 'queries.invalidate_failed');
}
