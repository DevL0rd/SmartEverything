import { DAY_MS } from '../metrics/minute';
import type { Sql } from './sql';

const KEPT_DAYS = 400;

const MS_PER_SECOND = 1000;

const LOG_TABLES = [
  'bottle_readings',
  'bottle_uv_cycles',
  'bottle_faults',
  'bottle_battery',
  'bottle_state_log',
  'bottle_adc',
] as const;

export function sweepBottleRetention(sql: Sql, now: Date): Record<string, number> {
  const cutoff = now.getTime() - KEPT_DAYS * DAY_MS;
  const swept = Object.fromEntries(
    LOG_TABLES.map((table) => [
      table,
      sql.run(`forget old ${table}`, `delete from ${table} where at < $before`, {
        before: Math.floor(cutoff / MS_PER_SECOND),
      }),
    ]),
  );
  return {
    ...swept,
    bottle_syncs: sql.run(
      'forget old bottle syncs',
      'delete from bottle_syncs where started_at < $before',
      { before: new Date(cutoff).toISOString() },
    ),
  };
}
