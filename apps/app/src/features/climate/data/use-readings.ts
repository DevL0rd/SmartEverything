import { useMemo } from 'react';
import { memoOnInputs } from '../../../store/memo-selector';
import { useStoreSelector } from '../../../store/store-context';
import { sourcesIn } from '../model/climate-devices';
import { readingsOf, type ComfortMetric, type MetricReading } from '../model/comfort';

function sameReading(left: MetricReading, right: MetricReading): boolean {
  return (
    left.metric === right.metric &&
    left.label === right.label &&
    left.amount === right.amount &&
    left.value === right.value &&
    left.unit === right.unit &&
    left.verdict === right.verdict &&
    left.tone === right.tone &&
    left.stale === right.stale
  );
}

function sameReadings(left: readonly MetricReading[], right: readonly MetricReading[]): boolean {
  return (
    left.length === right.length &&
    left.every((reading, index) => {
      const other = right[index];
      return other !== undefined && sameReading(reading, other);
    })
  );
}

export function useComfortReadings(
  metrics: readonly ComfortMetric[],
  room: string | null = null,
): readonly MetricReading[] {
  const selectReadings = useMemo(
    () =>
      memoOnInputs(
        (state) => [state.tables.devices, state.deviceValues, state.ledger],
        (state) => readingsOf(sourcesIn(state, room), metrics),
      ),
    [metrics, room],
  );
  return useStoreSelector(selectReadings, sameReadings);
}
