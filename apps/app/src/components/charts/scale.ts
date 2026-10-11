import { dateFormat } from '../../format/locale';
import { clock, shortClock } from '../../format/time';
import { fitTicks, fitWindow } from './fit-window';

export type ChartRange = '24h' | '7d' | '30d' | 'day' | 'week' | 'month' | 'year';

export interface ChartPoint {
  readonly t: number;
  readonly v: number;
}

export interface Extent {
  readonly min: number;
  readonly max: number;
}

interface Tick {
  readonly at: number;
  readonly label: string;
}

export interface XY {
  readonly x: number;
  readonly y: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const ROLLING: Readonly<Partial<Record<ChartRange, number>>> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

const MIN_GAP: Readonly<Record<ChartRange, number>> = {
  '24h': 15 * MINUTE_MS,
  day: 15 * MINUTE_MS,
  '7d': 2 * HOUR_MS,
  week: 2 * HOUR_MS,
  '30d': 36 * HOUR_MS,
  month: 36 * HOUR_MS,
  year: 10 * DAY_MS,
};

type TickUnit = 'hour' | 'day' | 'month';

interface TickRule {
  readonly unit: TickUnit;
  readonly every: number;
  readonly style: 'clock' | 'weekday' | 'date' | 'month';
}

const TICK_RULE: Readonly<Record<ChartRange, TickRule>> = {
  '24h': { unit: 'hour', every: 6, style: 'clock' },
  day: { unit: 'hour', every: 6, style: 'clock' },
  '7d': { unit: 'day', every: 1, style: 'weekday' },
  week: { unit: 'day', every: 1, style: 'weekday' },
  '30d': { unit: 'day', every: 7, style: 'date' },
  month: { unit: 'day', every: 7, style: 'date' },
  year: { unit: 'month', every: 1, style: 'month' },
};

const NICE_FACTORS = [1, 2, 2.5, 5, 10] as const;
const WIDEST_FACTOR = 20;

export function scaleLinear(domain: Extent, range: Extent): (value: number) => number {
  const span = domain.max - domain.min;
  const middle = (range.min + range.max) / 2;
  return (value) =>
    span === 0 ? middle : range.min + ((value - domain.min) / span) * (range.max - range.min);
}

export function extentOf(values: readonly number[]): Extent | null {
  const [first] = values;
  if (first === undefined) {
    return null;
  }
  return values.reduce<Extent>(
    (extent, value) => ({ min: Math.min(extent.min, value), max: Math.max(extent.max, value) }),
    { min: first, max: first },
  );
}

function padded(extent: Extent): Extent {
  if (extent.max > extent.min) {
    return extent;
  }
  const pad = extent.min === 0 ? 1 : Math.abs(extent.min) * 0.1;
  return { min: extent.min - pad, max: extent.max + pad };
}

function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

export function niceTicks(extent: Extent, count = 3): number[] {
  const bounds = padded(extent);
  const intervals = Math.max(1, count - 1);
  const raw = (bounds.max - bounds.min) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fits = (step: number): boolean =>
    Math.floor(bounds.min / step) * step + step * intervals >= bounds.max;
  const factor = NICE_FACTORS.find((candidate) => fits(candidate * magnitude)) ?? WIDEST_FACTOR;
  const step = factor * magnitude;
  const low = Math.floor(bounds.min / step) * step;
  return Array.from({ length: intervals + 1 }, (_, index) => tidy(low + index * step));
}

export function decimalsOf(value: number): number {
  const [, fraction = ''] = String(tidy(value)).split('.');
  return fraction.length;
}

export function startOf(moment: number, range: ChartRange): Date {
  const date = new Date(moment);
  date.setHours(0, 0, 0, 0);
  if (range === 'week') {
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  }
  if (range === 'month' || range === 'year') {
    date.setDate(1);
  }
  if (range === 'year') {
    date.setMonth(0);
  }
  return date;
}

function endOf(start: Date, range: ChartRange): number {
  const end = new Date(start);
  if (range === 'day') {
    end.setDate(end.getDate() + 1);
  } else if (range === 'week') {
    end.setDate(end.getDate() + 7);
  } else if (range === 'month') {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return end.getTime();
}

function windowOf(range: ChartRange, times: Extent): Extent {
  const rolling = ROLLING[range];
  if (rolling !== undefined) {
    return { min: times.max - rolling, max: times.max };
  }
  const start = startOf(times.min, range);
  return { min: start.getTime(), max: endOf(start, range) };
}

function advance(date: Date, unit: TickUnit, by: number): void {
  if (unit === 'hour') {
    date.setHours(date.getHours() + by);
  } else if (unit === 'day') {
    date.setDate(date.getDate() + by);
  } else {
    date.setMonth(date.getMonth() + by);
  }
}

function firstTick(from: number, rule: TickRule): Date {
  const date = new Date(from);
  date.setMinutes(0, 0, 0);
  if (rule.unit !== 'hour') {
    date.setHours(0);
  }
  if (rule.unit === 'month') {
    date.setDate(1);
  }
  while (date.getTime() < from || (rule.unit === 'hour' && date.getHours() % rule.every !== 0)) {
    advance(date, rule.unit, 1);
  }
  return date;
}

function tickLabel(at: number, style: TickRule['style']): string {
  const date = new Date(at);
  if (style === 'clock') {
    return shortClock(date);
  }
  if (style === 'weekday') {
    return dateFormat({ weekday: 'short' }).format(date);
  }
  if (style === 'date') {
    return dateFormat({ day: 'numeric', month: 'short' }).format(date);
  }
  return dateFormat({ month: 'short' }).format(date);
}

function timeTicks(window: Extent, range: ChartRange): Tick[] {
  const rule = TICK_RULE[range];
  const ticks: Tick[] = [];
  const cursor = firstTick(window.min, rule);
  while (cursor.getTime() <= window.max) {
    ticks.push({ at: cursor.getTime(), label: tickLabel(cursor.getTime(), rule.style) });
    advance(cursor, rule.unit, rule.every);
  }
  return ticks;
}

export function thinned<T>(items: readonly T[], width: number, minGap: number): T[] {
  const every = Math.max(1, Math.ceil((items.length * minGap) / Math.max(width, 1)));
  return items.filter((_, index) => index % every === 0);
}

function spaced(
  ticks: readonly Tick[],
  at: (t: number) => number,
  bounds: Extent,
  minGap: number,
): Tick[] {
  const kept: Tick[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const tick of ticks) {
    const x = at(tick.at);
    if (x - last >= minGap && x >= bounds.min && x + minGap / 4 <= bounds.max) {
      kept.push(tick);
      last = x;
    }
  }
  return kept;
}

export function pointLabel(at: number, range: ChartRange): string {
  const date = new Date(at);
  if (range === '24h' || range === 'day') {
    return clock(date);
  }
  const day = dateFormat({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  return range === 'year' ? day : `${day} ${clock(date)}`;
}

function medianStep(points: readonly ChartPoint[]): number {
  const steps = points
    .slice(1)
    .map((point, index) => point.t - (points[index]?.t ?? point.t))
    .sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)] ?? 0;
}

function gapThreshold(points: readonly ChartPoint[], range: ChartRange): number {
  return Math.max(MIN_GAP[range], 3 * medianStep(points));
}

function within(points: readonly ChartPoint[], window: Extent): ChartPoint[] {
  return points
    .filter((point) => point.t >= window.min && point.t <= window.max && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
}

export function segmentsOf(points: readonly ChartPoint[], maxGap: number): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];
  let previous: ChartPoint | null = null;
  for (const point of points) {
    if (previous !== null && point.t - previous.t > maxGap) {
      segments.push(current);
      current = [];
    }
    current.push(point);
    previous = point;
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

export interface Extrema {
  readonly peak: ChartPoint;
  readonly low: ChartPoint;
}

export function extremaOf(points: readonly ChartPoint[]): Extrema | null {
  const [first] = points;
  if (first === undefined) {
    return null;
  }
  return points.reduce<Extrema>(
    (found, point) => ({
      peak: point.v > found.peak.v ? point : found.peak,
      low: point.v < found.low.v ? point : found.low,
    }),
    { peak: first, low: first },
  );
}

function nearest(points: readonly ChartPoint[], t: number): ChartPoint | null {
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((points[middle]?.t ?? t) < t) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const before = points[low];
  const after = points[high];
  if (before === undefined || after === undefined) {
    return before ?? after ?? null;
  }
  return t - before.t <= after.t - t ? before : after;
}

export function linePath(points: readonly XY[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

export function clamp(value: number, extent: Extent): number {
  return Math.min(extent.max, Math.max(extent.min, value));
}

export function snap(value: number, extent: Extent, step: number): number {
  const steps = Math.round((clamp(value, extent) - extent.min) / step);
  return clamp(Number((extent.min + steps * step).toFixed(decimalsOf(step))), extent);
}

export interface PlotSeries {
  readonly points: readonly ChartPoint[];
}

export interface Drawn<S extends PlotSeries> {
  readonly series: S;
  readonly points: readonly ChartPoint[];
  readonly segments: readonly (readonly ChartPoint[])[];
}

export interface PlotBox {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PlotModel<S extends PlotSeries> {
  readonly box: PlotBox;
  readonly yTicks: readonly number[];
  readonly xTicks: readonly Tick[];
  readonly step: number;
  readonly drawn: readonly Drawn<S>[];
  readonly x: (t: number) => number;
  readonly y: (v: number) => number;
  readonly invert: (x: number) => number;
}

const X_LABEL_GAP = 64;

function drawnOf<S extends PlotSeries>(
  series: readonly S[],
  range: ChartRange,
  fit: boolean,
): { window: Extent; drawn: Drawn<S>[] } | null {
  const times = extentOf(series.flatMap((entry) => entry.points.map((point) => point.t)));
  if (times === null) {
    return null;
  }
  const window = fit ? fitWindow(times) : windowOf(range, times);
  const drawn = series.map((entry) => {
    const points = within(entry.points, window);
    return { series: entry, points, segments: segmentsOf(points, gapThreshold(points, range)) };
  });
  return { window, drawn };
}

function tickDomain(ticks: readonly number[], values: Extent): { domain: Extent; step: number } {
  const domain = { min: ticks[0] ?? values.min, max: ticks[ticks.length - 1] ?? values.max };
  return { domain, step: (ticks[1] ?? domain.max) - domain.min };
}

export function plotModel<S extends PlotSeries>(
  series: readonly S[],
  range: ChartRange,
  box: PlotBox,
  fit = false,
): PlotModel<S> | null {
  const data = drawnOf(series, range, fit);
  const values = extentOf(
    data?.drawn.flatMap((entry) => entry.points.map((point) => point.v)) ?? [],
  );
  if (data === null || values === null) {
    return null;
  }
  const yTicks = niceTicks(values);
  const { domain, step } = tickDomain(yTicks, values);
  const across = { min: box.left, max: box.right };
  const x = scaleLinear(data.window, across);
  const ticks = fit ? fitTicks(data.window) : timeTicks(data.window, range);
  return {
    box,
    yTicks,
    xTicks: spaced(ticks, x, across, X_LABEL_GAP),
    step,
    drawn: data.drawn,
    x,
    y: scaleLinear(domain, { min: box.bottom, max: box.top }),
    invert: scaleLinear(across, data.window),
  };
}

export interface Hit<S extends PlotSeries> {
  readonly series: S;
  readonly point: ChartPoint;
}

export function hitsAt<S extends PlotSeries>(model: PlotModel<S>, x: number): Hit<S>[] {
  const t = model.invert(clamp(x, { min: model.box.left, max: model.box.right }));
  return model.drawn.flatMap((drawn) => {
    const point = nearest(drawn.points, t);
    return point === null ? [] : [{ series: drawn.series, point }];
  });
}
