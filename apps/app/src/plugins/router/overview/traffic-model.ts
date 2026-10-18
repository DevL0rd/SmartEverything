import type { ChartPoint } from '../../../components/charts';
import type { ChartRange } from '../../../components/charts/scale';
import { clock } from '../../../format/time';

export const TRAFFIC_RANGES = [
  { value: 'live', label: 'Live' },
  { value: '6h', label: '6 h' },
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 d' },
] as const;

export type TrafficRange = (typeof TRAFFIC_RANGES)[number]['value'];

export type StoredRange = Exclude<TrafficRange, 'live'>;

export const TRAFFIC_HOURS: Readonly<Record<StoredRange, number>> = {
  '6h': 6,
  '24h': 24,
  '7d': 168,
};

export const TRAFFIC_CHART_RANGE: Readonly<Record<StoredRange, ChartRange>> = {
  '6h': '24h',
  '24h': '24h',
  '7d': '7d',
};

const BITS_PER_BYTE = 8;
const BITS_PER_MEGABIT = 1_000_000;

export function megabitsOf(bytesPerSecond: number): number {
  return (bytesPerSecond * BITS_PER_BYTE) / BITS_PER_MEGABIT;
}

export function megabitPoints(points: readonly ChartPoint[]): ChartPoint[] {
  return points.map((point) => ({ t: point.t, v: megabitsOf(point.v) }));
}

export function withLatest(
  points: readonly ChartPoint[],
  latest: { readonly at: number; readonly value: number } | null,
): ChartPoint[] {
  if (latest === null) {
    return [...points];
  }
  const kept = points.filter((point) => point.t < latest.at);
  return [...kept, { t: latest.at, v: latest.value }];
}

export interface TrafficTableRow {
  readonly at: number;
  readonly download: number;
  readonly upload: number | null;
}

export function peakOf(points: readonly ChartPoint[]): ChartPoint | null {
  return points.reduce<ChartPoint | null>(
    (best, point) => (best === null || point.v > best.v ? point : best),
    null,
  );
}

export function trafficSummary(
  download: readonly ChartPoint[],
  format: (megabits: number) => string,
): string | null {
  const peak = peakOf(download);
  const last = download[download.length - 1];
  if (peak === null || last === undefined) {
    return null;
  }
  return `Download peaked at ${format(peak.v)} at ${clock(peak.t)}; now ${format(last.v)}.`;
}

export function tableRows(
  download: readonly ChartPoint[],
  upload: readonly ChartPoint[],
  every: number,
): readonly TrafficTableRow[] {
  const uploadAt = new Map(upload.map((point) => [point.t, point.v]));
  return download
    .filter((_, index) => (download.length - 1 - index) % every === 0)
    .map((point) => ({ at: point.t, download: point.v, upload: uploadAt.get(point.t) ?? null }));
}

export function tableStep(count: number, rows: number): number {
  return Math.max(1, Math.ceil(count / rows));
}
