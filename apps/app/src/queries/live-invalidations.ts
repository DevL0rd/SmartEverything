import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { HistoryRow, LiveChange, LiveTable } from '@smarteverything/domain';
import { patchCameraDays, refreshSnapshots } from './camera-day';
import { entryChanges } from './health-entries';
import {
  AI_USAGE_PREFIX,
  HEALTH_PREFIX,
  HISTORY_PREFIX,
  OPENROUTER_ACCOUNT_KEY,
  PLUGIN_PREFIX,
  REACH_PREFIX,
} from './keys';

const HISTORY_KEY = z.tuple([z.literal('window'), z.literal('history'), z.string(), z.number()]);

function appendHistory(client: QueryClient, row: HistoryRow): void {
  for (const query of client.getQueryCache().findAll({ queryKey: HISTORY_PREFIX })) {
    const key = HISTORY_KEY.safeParse(query.queryKey);
    if (key.success && key.data[2].split(',').includes(row.capability)) {
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

export function applyToWindows(client: QueryClient, changes: readonly LiveChange[]): void {
  const tables = new Set<LiveTable>();
  for (const change of changes) {
    tables.add(change.table);
    if (
      change.table === 'state_history' &&
      change.record !== null &&
      change.operation === 'INSERT'
    ) {
      appendHistory(client, change.record);
    }
  }
  if ([...tables].some((table) => HEALTH_TABLES.has(table))) {
    void client.invalidateQueries({ queryKey: HEALTH_PREFIX });
  }
  if (tables.has('ai_usage')) {
    void client.invalidateQueries({ queryKey: AI_USAGE_PREFIX });
    void client.invalidateQueries({ queryKey: OPENROUTER_ACCOUNT_KEY });
  }
  if (tables.has('ai_outreach')) {
    void client.invalidateQueries({ queryKey: REACH_PREFIX });
  }
  if (tables.has('plugins')) {
    void client.invalidateQueries({ queryKey: PLUGIN_PREFIX });
  }
  if (tables.has('health_entries')) {
    entryChanges.update((count) => count + 1);
  }
  patchCameraDays(client, changes);
  refreshSnapshots(client, changes);
}
