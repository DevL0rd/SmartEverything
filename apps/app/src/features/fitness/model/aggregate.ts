import { max, min } from 'd3-array';
import type { Point } from './readers';
import { isOccurrence, type Better, type SeriesSpec } from './series-spec';
import { DAY_MS } from '../../../format/time';
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

function elapsedDays(from: number, to: number, until: number): number {
  return Math.max(1, Math.round((Math.min(to, until) - from) / DAY_MS));
}

function latestOf(points: readonly Point[]): number {
  return points.reduce((latest, point) => (point.at >= latest.at ? point : latest)).value;
}

function combined(spec: SeriesSpec, points: readonly Point[], perDays: number | null): number {
  switch (spec.combine) {
    case 'sum':
      return perDays === null || isOccurrence(spec) ? total(points) : total(points) / perDays;
    case 'mean':
      return total(points) / points.length;
    case 'latest':
      return latestOf(points);
  }
}

function within(points: readonly Point[], from: number, to: number): Point[] {
  return points.filter((point) => point.at >= from && point.at < to);
}

function boundsOf(points: readonly Point[]): Pick<BucketValue, 'low' | 'high'> {
  return {
    low: min(points, (point) => point.low) ?? null,
    high: max(points, (point) => point.high) ?? null,
  };
}

export function bucketise(
  spec: SeriesSpec,
  window: Window,
  points: readonly Point[],
  until: number,
): BucketValue[] {
  return window.buckets.map((bucket) => {
    const inside = within(points, bucket.start, bucket.end);
    if (inside.length === 0) {
      return { ...bucket, value: null, low: null, high: null };
    }
    const perDays = window.range === 'year' ? elapsedDays(bucket.start, bucket.end, until) : null;
    return { ...bucket, value: combined(spec, inside, perDays), ...boundsOf(inside) };
  });
}

export function summarise(
  spec: SeriesSpec,
  window: Window,
  points: readonly Point[],
  until: number,
): PeriodSummary {
  const inside = within(points, window.start, window.end);
  if (inside.length === 0) {
    return {
      headline: null,
      total: null,
      low: null,
      high: null,
      latest: null,
      count: 0,
    };
  }
  const perDays = window.range === 'day' ? null : elapsedDays(window.start, window.end, until);
  return {
    headline: combined(spec, inside, perDays),
    total: spec.combine === 'sum' ? total(inside) : null,
    ...boundsOf(inside),
    latest: latestOf(inside),
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

function isFilled(bucket: BucketValue): bucket is FilledBucket {
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
