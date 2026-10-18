import type { HealthMetric, HealthRecord, HealthRecordType } from '@smarteverything/domain';
import { useDailyFigures, useRecords } from './queries';
import {
  bucketise,
  summarise,
  trendOf,
  type BucketValue,
  type PeriodSummary,
  type Trend,
} from '../model/aggregate';
import { pointsOfDaily } from '../model/daily';
import { pointsOfRecords } from '../model/points';
import type { Point } from '../model/readers';
import { overlapping } from '../model/records';
import type { SeriesSpec } from '../model/series-spec';
import { DAY_MS, startOfDayKey } from '../../../format/time';
import { previousWindow, type Window } from '../model/window';
import { useToday } from './day';

export interface SeriesView {
  readonly window: Window;
  readonly current: boolean;
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

interface Fetch {
  readonly isPending: boolean;
  readonly error: Error | null;
}

export function statusOf(
  fromRecords: boolean,
  daily: Fetch,
  records: Fetch,
): Pick<SeriesView, 'loading' | 'problem'> {
  const governing = fromRecords ? records : daily;
  return { loading: governing.isPending, problem: governing.error?.message ?? null };
}

interface Sources {
  readonly fromRecords: boolean;
  readonly points: readonly Point[];
  readonly records: readonly HealthRecord[];
  readonly loading: boolean;
  readonly problem: string | null;
}

export interface SeriesReads {
  readonly fromRecords: boolean;
  readonly before: Window;
  readonly metrics: HealthMetric[];
  readonly types: HealthRecordType[];
}

export function seriesReads(spec: SeriesSpec, window: Window, withRecords: boolean): SeriesReads {
  const fromRecords = usesRecords(spec, window);
  return {
    fromRecords,
    before: previousWindow(window),
    metrics: fromRecords ? [] : dailyMetrics(spec),
    types: fromRecords || withRecords ? [spec.type] : [],
  };
}

function useSources(spec: SeriesSpec, window: Window, withRecords: boolean): Sources {
  const { fromRecords, before, metrics, types } = seriesReads(spec, window, withRecords);
  const daily = useDailyFigures(before.firstDay, window.lastDay, metrics);
  const records = useRecords(types, before.start, window.end);
  const loaded = records.data ?? [];
  return {
    fromRecords,
    points: fromRecords ? pointsOfRecords(spec, loaded) : pointsOfDaily(spec, daily.data ?? []),
    records: loaded,
    ...statusOf(fromRecords, daily, records),
  };
}

export function useSeries(spec: SeriesSpec, window: Window, withRecords: boolean): SeriesView {
  const before = previousWindow(window);
  const sources = useSources(spec, window, withRecords);
  const today = useToday();
  const until = startOfDayKey(today) + DAY_MS;
  const summary = summarise(spec, window, sources.points, until);
  const previous = summarise(spec, before, sources.points, until);
  return {
    window,
    current: window.end >= until,
    source: sources.fromRecords ? 'records' : 'daily',
    points: sources.points,
    buckets: bucketise(spec, window, sources.points, until),
    summary,
    previous,
    trend: trendOf(summary.headline, previous.headline, spec.better),
    records: overlapping(sources.records, window.start, window.end),
    loading: sources.loading,
    problem: sources.problem,
  };
}
