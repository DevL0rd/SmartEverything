import type { HealthMetric, HealthRecord } from '@smarteverything/domain';
import { useDailyFigures, useRecords } from './queries';
import {
  bucketise,
  summarise,
  trendOf,
  type BucketValue,
  type PeriodSummary,
  type Trend,
} from '../model/aggregate';
import { pointsOfDaily, pointsOfRecords, type Point } from '../model/points';
import { overlapping } from '../model/records';
import type { SeriesSpec } from '../model/series-spec';
import { previousWindow, type Window } from '../model/window';

export interface SeriesView {
  readonly window: Window;
  readonly source: 'records' | 'daily';
  readonly points: readonly Point[];
  readonly buckets: readonly BucketValue[];
  readonly summary: PeriodSummary;
  readonly previous: PeriodSummary;
  readonly trend: Trend | null;
  readonly records: readonly HealthRecord[];
  readonly loading: boolean;
  readonly problem: string | null;
}

function dailyMetrics(spec: SeriesSpec): HealthMetric[] {
  if (spec.daily === null) {
    return [];
  }
  return spec.dailyRange === null
    ? [spec.daily]
    : [spec.daily, spec.dailyRange.min, spec.dailyRange.max];
}

function usesRecords(spec: SeriesSpec, window: Window): boolean {
  return spec.daily === null || window.range === 'day';
}

function problemOf(...errors: readonly (Error | null)[]): string | null {
  return errors.find((error): error is Error => error !== null)?.message ?? null;
}

interface Sources {
  readonly fromRecords: boolean;
  readonly points: readonly Point[];
  readonly records: readonly HealthRecord[];
  readonly loading: boolean;
  readonly problem: string | null;
}

function useSources(spec: SeriesSpec, window: Window, withRecords: boolean): Sources {
  const before = previousWindow(window);
  const fromRecords = usesRecords(spec, window);
  const wantRecords = fromRecords || withRecords;
  const daily = useDailyFigures(
    before.firstDay,
    window.lastDay,
    fromRecords ? [] : dailyMetrics(spec),
  );
  const records = useRecords(wantRecords ? [spec.type] : [], before.start, window.end);
  const loaded = records.data ?? [];
  const recordsWaiting = wantRecords && records.isPending;
  return {
    fromRecords,
    points: fromRecords ? pointsOfRecords(spec, loaded) : pointsOfDaily(spec, daily.data ?? []),
    records: loaded,
    loading: fromRecords ? recordsWaiting : daily.isPending || recordsWaiting,
    problem: problemOf(daily.error, records.error),
  };
}

export function useSeries(spec: SeriesSpec, window: Window, withRecords: boolean): SeriesView {
  const before = previousWindow(window);
  const sources = useSources(spec, window, withRecords);
  const summary = summarise(spec, window, sources.points);
  const previous = summarise(spec, before, sources.points);
  return {
    window,
    source: sources.fromRecords ? 'records' : 'daily',
    points: sources.points,
    buckets: bucketise(spec, window, sources.points),
    summary,
    previous,
    trend: trendOf(summary.headline, previous.headline, spec.better),
    records: overlapping(sources.records, window.start, window.end),
    loading: sources.loading,
    problem: sources.problem,
  };
}
