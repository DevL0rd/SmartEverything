import type { HealthDailyRow, HealthMetric } from '@smarteverything/domain';
import { rowsOf, type StoreState } from '../../store/state';

type Daily = StoreState['tables']['health_daily'];

const indexes = new WeakMap<Daily, ReadonlyMap<HealthMetric, readonly HealthDailyRow[]>>();

function build(table: Daily): ReadonlyMap<HealthMetric, readonly HealthDailyRow[]> {
  const byMetric = new Map<HealthMetric, HealthDailyRow[]>();
  for (const row of rowsOf(table)) {
    const rows = byMetric.get(row.metric);
    if (rows === undefined) {
      byMetric.set(row.metric, [row]);
    } else {
      rows.push(row);
    }
  }
  for (const rows of byMetric.values()) {
    rows.sort((left, right) => (left.day < right.day ? 1 : left.day > right.day ? -1 : 0));
  }
  return byMetric;
}

export function dailyOf(
  state: StoreState,
  metric: HealthMetric,
  profileId: string | null,
): readonly HealthDailyRow[] {
  const table = state.tables.health_daily;
  let index = indexes.get(table);
  if (index === undefined) {
    index = build(table);
    indexes.set(table, index);
  }
  const rows = index.get(metric) ?? [];
  return profileId === null ? rows : rows.filter((row) => row.profile_id === profileId);
}

export function latestDaily(
  state: StoreState,
  metric: HealthMetric,
  profileId: string | null,
): HealthDailyRow | null {
  return dailyOf(state, metric, profileId)[0] ?? null;
}
