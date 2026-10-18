import type { Bar, ChartPoint, RangeBucket } from '../../../components/charts';
import { bestBucket, type BucketValue, type PeriodSummary, type Trend } from './aggregate';
import { downsample } from './downsample';
import { formatReading } from './catalogue';
import { trendWords } from './format';
import type { Point } from './readers';
import { isOccurrence, type SeriesSpec } from './series-spec';
import type { Range } from './window';

export interface SeriesStat {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly good?: boolean | null;
}

const PREVIOUS: Readonly<Record<Range, { readonly current: string; readonly earlier: string }>> = {
  day: { current: 'Yesterday', earlier: 'Previous day' },
  week: { current: 'Last week', earlier: 'Previous week' },
  month: { current: 'Last month', earlier: 'Previous month' },
  year: { current: 'Last year', earlier: 'Previous year' },
};

export function headlineLabel(spec: SeriesSpec, range: Range): string {
  if (isOccurrence(spec)) {
    return 'Count';
  }
  switch (spec.combine) {
    case 'sum':
      return range === 'day' ? 'Total' : 'Daily average';
    case 'mean':
      return 'Average';
    case 'latest':
      return 'Latest';
  }
}

export interface SeriesFacts {
  readonly spec: SeriesSpec;
  readonly range: Range;
  readonly current: boolean;
  readonly summary: PeriodSummary;
  readonly previous: PeriodSummary;
  readonly trend: Trend | null;
  readonly buckets: readonly BucketValue[];
}

function bestStat(facts: SeriesFacts): SeriesStat | null {
  if (facts.range === 'day' || facts.spec.better === 'neither') {
    return null;
  }
  const best = bestBucket(facts.spec, facts.buckets);
  if (best === null) {
    return null;
  }
  return {
    label: facts.range === 'year' ? 'Best month' : 'Best day',
    value: formatReading(facts.spec, best.value),
    note: best.label,
  };
}

function periodStats(facts: SeriesFacts): SeriesStat[] {
  const { spec, summary } = facts;
  const stats: SeriesStat[] = [];
  if (summary.total !== null && facts.range !== 'day' && !isOccurrence(spec)) {
    stats.push({ label: 'Total', value: formatReading(spec, summary.total) });
  }
  if (spec.combine === 'mean' && summary.low !== null && summary.high !== null) {
    stats.push({
      label: 'Range',
      value: `${formatReading(spec, summary.low)} – ${formatReading(spec, summary.high)}`,
    });
  }
  return stats;
}

function previousStat(facts: SeriesFacts): SeriesStat[] {
  const headline = facts.previous.headline;
  if (headline === null) {
    return [];
  }
  return [
    {
      label: PREVIOUS[facts.range][facts.current ? 'current' : 'earlier'],
      value: formatReading(facts.spec, headline),
      note: trendWords(facts.spec, facts.trend, true),
      good: facts.trend?.good ?? null,
    },
  ];
}

export function seriesStats(facts: SeriesFacts): readonly SeriesStat[] {
  const best = bestStat(facts);
  return [...periodStats(facts), ...previousStat(facts), ...(best === null ? [] : [best])];
}

const MONTH_TICKS = new Set(['1', '8', '15', '22', '29']);
const HOUR_TICKS = new Set(['00', '06', '12', '18']);

function tickOf(range: Range, label: string): string | null {
  switch (range) {
    case 'day':
      return HOUR_TICKS.has(label) ? label : null;
    case 'month':
      return MONTH_TICKS.has(label) ? label : null;
    case 'week':
      return label;
    case 'year':
      return label.charAt(0);
  }
}

function markOf(range: Range, bucket: BucketValue): { key: string; label?: string } {
  const tick = tickOf(range, bucket.label);
  return { key: String(bucket.start), ...(tick === null ? {} : { label: tick }) };
}

export function barsOf(range: Range, buckets: readonly BucketValue[]): readonly Bar[] {
  return buckets.map((bucket) => ({ ...markOf(range, bucket), value: bucket.value ?? 0 }));
}

export function rangeBucketsOf(
  range: Range,
  buckets: readonly BucketValue[],
): readonly RangeBucket[] {
  return buckets.map((bucket) => ({ ...markOf(range, bucket), min: bucket.low, max: bucket.high }));
}

export function chartPointsOf(
  points: readonly Point[],
  from: number,
  to: number,
): readonly ChartPoint[] {
  return downsample(
    points
      .filter((point) => point.at >= from && point.at < to)
      .map((point) => ({ t: point.at, v: point.value })),
    from,
    to,
  );
}
