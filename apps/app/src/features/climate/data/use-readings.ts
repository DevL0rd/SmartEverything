import { useMemo } from 'react';
import type { StoreState } from '../../../store/state';
import { memoOnInputs } from '../../../store/memo-selector';
import { useStoreSelector } from '../../../store/store-context';
import { sourcesIn } from '../model/climate-devices';
import { readingsOf, type ComfortMetric, type MetricReading } from '../model/comfort';

function sameReading(left: MetricReading, right: MetricReading): boolean {
  return (
    left.metric === right.metric &&
    left.label === right.label &&
    left.value === right.value &&
    left.unit === right.unit &&
    left.verdict === right.verdict &&
    left.tone === right.tone &&
    left.stale === right.stale
  );
}

export function sameReadings(
  left: readonly MetricReading[],
  right: readonly MetricReading[],
): boolean {
  return (
    left.length === right.length &&
    left.every((reading, index) => {
      const other = right[index];
      return other !== undefined && sameReading(reading, other);
    })
  );
}

export function comfortSelector(
  metrics: readonly ComfortMetric[],
  room: string | null,
): (state: StoreState) => readonly MetricReading[] {
  return memoOnInputs(
    (state) => [sourcesIn(state, room)],
    (state) => readingsOf(sourcesIn(state, room), metrics),
  );
}

export function useComfortReadings(
  metrics: readonly ComfortMetric[],
  room: string | null = null,
): readonly MetricReading[] {
  const selectReadings = useMemo(() => comfortSelector(metrics, room), [metrics, room]);
  return useStoreSelector(selectReadings, sameReadings);
}
