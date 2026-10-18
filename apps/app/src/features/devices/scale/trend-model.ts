import type { ChartPoint, ChartRange } from '../../../components/charts';
import { DAY_MS } from '../../../format/time';
import { countedOf, type WeighIn } from './weigh-ins';

export const TREND_RANGES = [
  { value: '7d', label: '7 d', days: 7, chart: '7d' },
  { value: '30d', label: '30 d', days: 30, chart: '30d' },
  { value: '90d', label: '90 d', days: 90, chart: 'year' },
  { value: '1y', label: '1 y', days: 365, chart: 'year' },
] as const satisfies readonly {
  readonly value: string;
  readonly label: string;
  readonly days: number;
  readonly chart: ChartRange;
}[];

export type TrendRange = (typeof TREND_RANGES)[number]['value'];

export const DEFAULT_RANGE: TrendRange = '30d';

export function rangeOf(range: TrendRange): (typeof TREND_RANGES)[number] {
  const found = TREND_RANGES.find((entry) => entry.value === range);
  if (found === undefined) {
    throw new RangeError(`Unknown trend range ${range}`);
  }
  return found;
}

export interface TrendData {
  readonly counted: readonly ChartPoint[];
  readonly notCounted: readonly WeighIn[];
}

export function trendOf(weighIns: readonly WeighIn[], range: TrendRange, now: number): TrendData {
  const from = now - rangeOf(range).days * DAY_MS;
  const inRange = weighIns.filter((weighIn) => weighIn.at >= from);
  return {
    counted: countedOf(inRange).map((weighIn) => ({ t: weighIn.at, v: weighIn.kg })),
    notCounted: inRange.filter((weighIn) => weighIn.outlier),
  };
}

export function weeklyAverages(points: readonly ChartPoint[]): readonly ChartPoint[] {
  const weeks = new Map<number, { sum: number; count: number; last: number }>();
  for (const point of points) {
    const week = Math.floor(point.t / (7 * DAY_MS));
    const found = weeks.get(week) ?? { sum: 0, count: 0, last: point.t };
    weeks.set(week, {
      sum: found.sum + point.v,
      count: found.count + 1,
      last: Math.max(found.last, point.t),
    });
  }
  return [...weeks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, week]) => ({ t: week.last, v: week.sum / week.count }));
}

const PANEL_WEEKS_MIN = 2;

export function cardPoints(
  counted: readonly ChartPoint[],
  days: number,
  weekly: boolean,
  now: number,
): readonly ChartPoint[] {
  const recent = counted.filter((point) => point.t >= now - days * DAY_MS);
  const averages = weekly ? weeklyAverages(recent) : [];
  return averages.length >= PANEL_WEEKS_MIN ? averages : recent;
}
