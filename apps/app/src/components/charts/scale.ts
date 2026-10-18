import { bisector, extent, greatest, least } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { area, line } from 'd3-shape';
import { dateFormat } from '../../format/locale';
import { DAY_MS, HOUR_MS, MINUTE_MS, clock } from '../../format/time';
import { fitTicks, fitWindow, rangeTicks } from './time-ticks';
import type { XY } from './geometry';

export type ChartRange = '24h' | '7d' | '30d' | 'day' | 'week' | 'month' | 'year';

export interface ChartPoint {
  readonly t: number;
  readonly v: number;
}

export interface Extent {
  readonly min: number;
  readonly max: number;
}

export interface Tick {
  readonly at: number;
  readonly label: string;
}

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

export function extentOf(values: Iterable<number>): Extent | null {
  const bounds = extent(values);
  return bounds[0] === undefined ? null : { min: bounds[0], max: bounds[1] };
}

function padded(bounds: Extent): Extent {
  if (bounds.max > bounds.min) {
    return bounds;
  }
  const pad = bounds.min === 0 ? 1 : Math.abs(bounds.min) * 0.1;
  return { min: bounds.min - pad, max: bounds.max + pad };
}

const NICE_FACTORS = [1, 2, 2.5, 5, 10] as const;

function tidy(value: number): number {
  return Number(value.toPrecision(12));
}

export function niceTicks(bounds: Extent, count = 3): number[] {
  const { min, max } = padded(bounds);
  const intervals = Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10((max - min) / intervals));
  const step =
    magnitude *
    (NICE_FACTORS.find(
      (factor) =>
        Math.floor(min / (factor * magnitude)) * factor * magnitude +
          factor * magnitude * intervals >=
        max,
    ) ?? 20);
  const low = Math.floor(min / step) * step;
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

function within(points: readonly ChartPoint[], bounds: Extent): ChartPoint[] {
  return points
    .filter((point) => point.t >= bounds.min && point.t <= bounds.max && Number.isFinite(point.v))
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
  const peak = greatest(points, (point) => point.v);
  const low = least(points, (point) => point.v);
  return peak === undefined || low === undefined ? null : { peak, low };
}

const nearest = bisector((point: ChartPoint) => point.t);

const stroke = line<XY>()
  .x((point) => point.x)
  .y((point) => point.y);

export function linePath(points: readonly XY[]): string {
  return stroke(points) ?? '';
}

export function areaPath(points: readonly XY[], baseline: number): string {
  return (
    area<XY>()
      .x((point) => point.x)
      .y0(baseline)
      .y1((point) => point.y)(points) ?? ''
  );
}

export function clamp(value: number, bounds: Extent): number {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

export function snap(value: number, bounds: Extent, step: number): number {
  const steps = Math.round((clamp(value, bounds) - bounds.min) / step);
  return clamp(Number((bounds.min + steps * step).toFixed(decimalsOf(step))), bounds);
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

function xTicksOf(window: Extent, range: ChartRange, fit: boolean): ReturnType<typeof rangeTicks> {
  return fit ? fitTicks(window) : rangeTicks(window, range);
}

export interface PlotView {
  readonly fit: boolean;
  readonly domain: Extent | null;
}

const NO_VIEW: PlotView = { fit: false, domain: null };

export function plotModel<S extends PlotSeries>(
  series: readonly S[],
  range: ChartRange,
  box: PlotBox,
  view: PlotView = NO_VIEW,
): PlotModel<S> | null {
  const { fit, domain } = view;
  const data = drawnOf(series, range, fit);
  const values = extentOf(
    data?.drawn.flatMap((entry) => entry.points.map((point) => point.v)) ?? [],
  );
  if (data === null || values === null) {
    return null;
  }
  const yTicks = niceTicks(domain ?? values);
  const low = yTicks[0] ?? values.min;
  const high = yTicks[yTicks.length - 1] ?? values.max;
  const x = scaleLinear([data.window.min, data.window.max], [box.left, box.right]);
  const ticks = xTicksOf(data.window, range, fit);
  return {
    box,
    yTicks,
    xTicks: spaced(ticks, x, { min: box.left, max: box.right }, X_LABEL_GAP),
    step: (yTicks[1] ?? high) - low,
    drawn: data.drawn,
    x,
    y: scaleLinear([low, high], [box.bottom, box.top]),
    invert: (px) => x.invert(px),
  };
}

export interface LiveFrame {
  readonly window: Extent;
  readonly domain: Extent;
  readonly ticks: readonly Tick[];
  readonly maxGap: number;
}

export function livePlotModel<S extends PlotSeries>(
  series: readonly S[],
  frame: LiveFrame,
  box: PlotBox,
): PlotModel<S> {
  const { window, domain } = frame;
  const middle = (domain.min + domain.max) / 2;
  const x = scaleLinear([window.min, window.max], [box.left, box.right]);
  return {
    box,
    yTicks: [domain.min, middle, domain.max],
    xTicks: frame.ticks,
    step: middle - domain.min,
    drawn: series.map((entry) => {
      const points = within(entry.points, window);
      return { series: entry, points, segments: segmentsOf(points, frame.maxGap) };
    }),
    x,
    y: scaleLinear([domain.min, domain.max], [box.bottom, box.top]),
    invert: (px) => x.invert(px),
  };
}

export interface Hit<S extends PlotSeries> {
  readonly series: S;
  readonly point: ChartPoint;
}

export function hitsAt<S extends PlotSeries>(model: PlotModel<S>, x: number): Hit<S>[] {
  const t = model.invert(clamp(x, { min: model.box.left, max: model.box.right }));
  return model.drawn.flatMap((drawn) => {
    const point = drawn.points[nearest.center(drawn.points, t)];
    return point === undefined ? [] : [{ series: drawn.series, point }];
  });
}
