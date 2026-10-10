import type { Point } from './points';
import type { Better, Combine, SeriesSpec } from './series-spec';
import { dayKeyOf } from '../../../format/time';
import { type Window } from './window';

export interface BucketValue {
  readonly label: string;
  readonly start: number;
  readonly end: number;
  readonly value: number | null;
  readonly low: number | null;
  readonly high: number | null;
}

export interface PeriodSummary {
  readonly headline: number | null;
  readonly total: number | null;
  readonly low: number | null;
  readonly high: number | null;
  readonly latest: number | null;
  readonly daysWithData: number;
  readonly count: number;
}

type Direction = 'up' | 'down' | 'flat';

export interface Trend {
  readonly delta: number;
  readonly percent: number | null;
  readonly direction: Direction;
  readonly good: boolean | null;
}

function total(points: readonly Point[]): number {
  return points.reduce((sum, point) => sum + point.value, 0);
}

function distinctDays(points: readonly Point[]): number {
  return new Set(points.map((point) => dayKeyOf(point.at))).size;
}

function combined(combine: Combine, points: readonly Point[], perDay: boolean): number {
  switch (combine) {
    case 'sum':
      return perDay ? total(points) / distinctDays(points) : total(points);
    case 'mean':
      return total(points) / points.length;
    case 'latest':
      return points.reduce((latest, point) => (point.at >= latest.at ? point : latest)).value;
  }
}

function within(points: readonly Point[], from: number, to: number): Point[] {
  return points.filter((point) => point.at >= from && point.at < to);
}

export function bucketise(
  spec: SeriesSpec,
  window: Window,
  points: readonly Point[],
): BucketValue[] {
  const perDay = window.range === 'year';
  return window.buckets.map((bucket) => {
    const inside = within(points, bucket.start, bucket.end);
    if (inside.length === 0) {
      return { ...bucket, value: null, low: null, high: null };
    }
    return {
      ...bucket,
      value: combined(spec.combine, inside, perDay),
      low: Math.min(...inside.map((point) => point.low)),
      high: Math.max(...inside.map((point) => point.high)),
    };
  });
}

export function summarise(
  spec: SeriesSpec,
  window: Window,
  points: readonly Point[],
): PeriodSummary {
  const inside = within(points, window.start, window.end);
  const days = distinctDays(inside);
  if (inside.length === 0) {
    return {
      headline: null,
      total: null,
      low: null,
      high: null,
      latest: null,
      daysWithData: 0,
      count: 0,
    };
  }
  return {
    headline: combined(spec.combine, inside, window.range !== 'day'),
    total: spec.combine === 'sum' ? total(inside) : null,
    low: Math.min(...inside.map((point) => point.low)),
    high: Math.max(...inside.map((point) => point.high)),
    latest: combined('latest', inside, false),
    daysWithData: days,
    count: inside.length,
  };
}

export function trendOf(
  current: number | null,
  previous: number | null,
  better: Better,
): Trend | null {
  if (current === null || previous === null) {
    return null;
  }
  const delta = current - previous;
  const flat = Math.abs(delta) < 1e-9;
  const direction: Direction = flat ? 'flat' : delta > 0 ? 'up' : 'down';
  return {
    delta,
    percent: previous === 0 ? null : (delta / Math.abs(previous)) * 100,
    direction,
    good: better === 'neither' || flat ? null : (better === 'higher') === delta > 0,
  };
}

export type FilledBucket = BucketValue & {
  readonly value: number;
  readonly low: number;
  readonly high: number;
};

export function isFilled(bucket: BucketValue): bucket is FilledBucket {
  return bucket.value !== null && bucket.low !== null && bucket.high !== null;
}

export function bestBucket(spec: SeriesSpec, buckets: readonly BucketValue[]): FilledBucket | null {
  const filled = buckets.filter(isFilled);
  const [first, ...rest] = filled;
  if (first === undefined) {
    return null;
  }
  const lower = spec.better === 'lower';
  return rest.reduce(
    (best, bucket) =>
      (lower ? bucket.value < best.value : bucket.value > best.value) ? bucket : best,
    first,
  );
}
