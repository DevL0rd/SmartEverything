import type { Bar, ChartPoint, RangeBucket } from '../../../components/charts';
import {
  bestBucket,
  isFilled,
  type BucketValue,
  type PeriodSummary,
  type Trend,
} from './aggregate';
import { formatReading } from './catalogue';
import { trendWords } from './format';
import type { Point } from './points';
import type { SeriesSpec } from './series-spec';
import type { Range } from './window';

export interface SeriesStat {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly good?: boolean | null;
}

const PERIOD: Readonly<Record<Range, string>> = {
  day: 'Yesterday',
  week: 'Last week',
  month: 'Last month',
  year: 'Last year',
};

export function headlineLabel(spec: SeriesSpec, range: Range): string {
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

export function seriesStats(facts: SeriesFacts): readonly SeriesStat[] {
  const { spec, summary, previous } = facts;
  const stats: SeriesStat[] = [];
  if (summary.total !== null && facts.range !== 'day') {
    stats.push({ label: 'Total', value: formatReading(spec, summary.total) });
  }
  if (spec.combine === 'mean' && summary.low !== null && summary.high !== null) {
    stats.push({
      label: 'Range',
      value: `${formatReading(spec, summary.low)} – ${formatReading(spec, summary.high)}`,
    });
  }
  if (previous.headline !== null) {
    stats.push({
      label: PERIOD[facts.range],
      value: formatReading(spec, previous.headline),
      note: trendWords(spec, facts.trend, true),
      good: facts.trend?.good ?? null,
    });
  }
  const best = bestStat(facts);
  return best === null ? stats : [...stats, best];
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

export function barsOf(range: Range, buckets: readonly BucketValue[]): readonly Bar[] {
  return buckets.map((bucket) => {
    const tick = tickOf(range, bucket.label);
    return {
      key: String(bucket.start),
      value: bucket.value ?? 0,
      ...(tick === null ? {} : { label: tick }),
    };
  });
}

export function rangeBucketsOf(buckets: readonly BucketValue[]): readonly RangeBucket[] {
  return buckets.filter(isFilled).map((bucket) => ({
    key: String(bucket.start),
    min: bucket.low,
    max: bucket.high,
  }));
}

export function chartPointsOf(
  points: readonly Point[],
  from: number,
  to: number,
): readonly ChartPoint[] {
  return points
    .filter((point) => point.at >= from && point.at < to)
    .map((point) => ({ t: point.at, v: point.value }));
}
