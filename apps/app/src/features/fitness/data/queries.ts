import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  HEALTH_METRICS,
  SNAPSHOT_WINDOWS,
  type HealthMetric,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { HEALTH_PREFIX } from '../../../queries/keys';
import { useRows } from '../../../store/selectors';
import type { DailyFigure } from '../model/points';
import type { SourceSighting } from '../model/sources';
import { shiftDay, startOfDayKey } from '../../../format/time';
import { useMyLiveToday, type LiveToday } from '../../watches';
import {
  readBestDay,
  readDailyFigures,
  readRecord,
  readRecords,
  readSightings,
  type BestDay,
} from './reads';

export const PRESENCE_DAYS = 90;

export const healthKeys = {
  daily: (first: string, last: string, metrics: readonly HealthMetric[]) =>
    [...HEALTH_PREFIX, 'daily', first, last, metrics.join(',')] as const,
  records: (types: readonly HealthRecordType[], from: number, to: number) =>
    [...HEALTH_PREFIX, 'records', types.join(','), from, to] as const,
  best: (metric: HealthMetric, lowest: boolean) =>
    [...HEALTH_PREFIX, 'best', metric, lowest] as const,
  sightings: (since: number) => [...HEALTH_PREFIX, 'sightings', since] as const,
  record: (recordId: string) => [...HEALTH_PREFIX, 'record', recordId] as const,
};

export function sightingsSince(today: string): number {
  return startOfDayKey(shiftDay(today, -PRESENCE_DAYS));
}

export function useDailyFigures(
  first: string,
  last: string,
  metrics: readonly HealthMetric[],
): UseQueryResult<DailyFigure[]> {
  return useQuery({
    queryKey: healthKeys.daily(first, last, metrics),
    queryFn: () => readDailyFigures(first, last, metrics),
    enabled: metrics.length > 0 && first <= last,
  });
}

export interface DailyRows {
  readonly figures: readonly DailyFigure[];
  readonly complete: boolean;
  readonly error: Error | null;
}

function liveFirstDay(today: string): string {
  return shiftDay(today, 1 - SNAPSHOT_WINDOWS.healthDailyDays);
}

function withLiveToday(
  figures: readonly DailyFigure[],
  today: string,
  live: readonly LiveToday[],
): readonly DailyFigure[] {
  if (live.length === 0) {
    return figures;
  }
  const replaced = new Set<string>(live.map((item) => item.metric));
  return [
    ...figures.filter((figure) => !(figure.day === today && replaced.has(figure.metric))),
    ...live.map((item) => ({ day: today, metric: item.metric, value: item.value })),
  ];
}

export function useDailyRows(first: string, today: string): DailyRows {
  const liveToday = useMyLiveToday();
  const live = useRows('health_daily');
  const liveFirst = liveFirstDay(today);
  const olderLast = shiftDay(liveFirst, -1);
  const older = useDailyFigures(first, olderLast, first <= olderLast ? HEALTH_METRICS : []);
  const fromStore = live.filter((row) => row.day >= liveFirst && row.day >= first);
  const before = first <= olderLast ? (older.data ?? []) : [];
  return {
    figures: withLiveToday([...before, ...fromStore], today, liveToday),
    complete: first > olderLast || older.data !== undefined,
    error: older.error,
  };
}

export function useRecords(
  types: readonly HealthRecordType[],
  from: number,
  to: number,
): UseQueryResult<HealthRecord[]> {
  return useQuery({
    queryKey: healthKeys.records(types, from, to),
    queryFn: () => readRecords(types, from, to),
    enabled: types.length > 0,
  });
}

export function useBestDay(metric: HealthMetric, lowest: boolean): UseQueryResult<BestDay | null> {
  return useQuery({
    queryKey: healthKeys.best(metric, lowest),
    queryFn: () => readBestDay(metric, lowest),
  });
}

export function useSightings(today: string): UseQueryResult<SourceSighting[]> {
  const since = sightingsSince(today);
  return useQuery({
    queryKey: healthKeys.sightings(since),
    queryFn: () => readSightings(since),
  });
}

export function useRecord(recordId: string): UseQueryResult<HealthRecord | null> {
  return useQuery({
    queryKey: healthKeys.record(recordId),
    queryFn: () => readRecord(recordId),
  });
}
