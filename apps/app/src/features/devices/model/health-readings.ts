import type { HealthMetric } from '@smarteverything/domain';
import { useStoreSelector } from '../../../store/store-context';
import { rowsOf, type StoreState } from '../../../store/state';

export interface DayReading {
  readonly day: string;
  readonly value: number;
  readonly unit: string;
}

function readingsIn(state: StoreState, metric: HealthMetric): readonly DayReading[] {
  return rowsOf(state.tables.health_daily)
    .filter((row) => row.metric === metric)
    .map((row) => ({ day: row.day, value: row.value, unit: row.unit }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function sameReadings(left: readonly DayReading[], right: readonly DayReading[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (reading, index) => reading.day === right[index]?.day && reading.value === right[index].value,
    )
  );
}

export function useDayReadings(metric: HealthMetric): readonly DayReading[] {
  return useStoreSelector((state) => readingsIn(state, metric), sameReadings);
}
