import type { HealthMetric } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { MACROS } from '../model/macros';
import { shiftDay } from '../../../format/time';

export type DayTotals = Readonly<Partial<Record<HealthMetric, number>>>;

const SHOWN: ReadonlySet<HealthMetric> = new Set([
  ...MACROS.map((macro) => macro.metric),
  'hydration',
  'total_energy',
  'active_energy',
]);

function sameTotals(left: DayTotals, right: DayTotals): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...SHOWN].every((metric) => !keys.has(metric) || left[metric] === right[metric]);
}

export function useDayTotals(day: string): DayTotals {
  return useStoreSelector((state) => {
    const totals: Partial<Record<HealthMetric, number>> = {};
    const table = state.tables.health_daily;
    for (const id of table.ids) {
      const row = table.byId[id];
      if (row?.day === day && SHOWN.has(row.metric)) {
        totals[row.metric] = row.value;
      }
    }
    return totals;
  }, sameTotals);
}

export function useRecentMetric(day: string, days: number, metric: HealthMetric): boolean {
  return useStoreSelector((state) => {
    const first = shiftDay(day, -days);
    const table = state.tables.health_daily;
    return table.ids.some((id) => {
      const row = table.byId[id];
      return row?.metric === metric && row.day >= first;
    });
  });
}
