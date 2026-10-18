import type { HealthDailyRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { emptyState, makeTable, type StoreState } from '../../store/state';
import { dailyOf, latestDaily } from './daily-index';

function row(
  day: string,
  metric: HealthDailyRow['metric'],
  value: number,
  profile = 'p1',
): HealthDailyRow {
  return { profile_id: profile, day, metric, value, unit: 'x', updated_at: `${day}T00:00:00Z` };
}

function stateOf(rows: readonly HealthDailyRow[]): StoreState {
  const base = emptyState();
  const byId = Object.fromEntries(rows.map((each) => [`${each.day}/${each.metric}`, each]));
  return {
    ...base,
    tables: { ...base.tables, health_daily: makeTable(byId, Object.keys(byId), 1) },
  };
}

const ROWS = [
  row('2026-10-14', 'steps', 100),
  row('2026-10-16', 'steps', 300),
  row('2026-10-15', 'steps', 200),
  row('2026-10-15', 'sleep', 420),
  row('2026-10-13', 'steps', 999, 'p2'),
];

describe('daily index', () => {
  it('lists one metric newest day first', () => {
    expect(dailyOf(stateOf(ROWS), 'steps', 'p1').map((each) => each.day)).toEqual([
      '2026-10-16',
      '2026-10-15',
      '2026-10-14',
    ]);
  });

  it('keeps one profile apart from another', () => {
    expect(latestDaily(stateOf(ROWS), 'steps', 'p2')?.value).toBe(999);
    expect(latestDaily(stateOf(ROWS), 'steps', null)?.day).toBe('2026-10-16');
  });

  it('has nothing for a metric that was never synced', () => {
    expect(latestDaily(stateOf(ROWS), 'distance', 'p1')).toBeNull();
    expect(dailyOf(stateOf([]), 'steps', 'p1')).toEqual([]);
  });

  it('reuses the index while the table is the same object', () => {
    const state = stateOf(ROWS);
    expect(dailyOf(state, 'sleep', null)).toBe(dailyOf(state, 'sleep', null));
  });
});
