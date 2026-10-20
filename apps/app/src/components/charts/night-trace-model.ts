import { decimal, withUnit } from '../../format/number';
import { MINUTE_MS, clock } from '../../format/time';
import {
  NIGHT_EDGE_PAD,
  NIGHT_GUTTER_W,
  nightX,
  type NightFrame,
  type NightWindow,
} from './night-axis';

export interface TracePoint {
  readonly at: number;
  readonly value: number;
}

export interface TraceDomain {
  readonly min: number;
  readonly max: number;
}

export const TRACE_HEIGHT_PHONE = 64;
export const TRACE_HEIGHT_DESKTOP = 72;
export const TRACE_MAX_GAP_MS = 10 * MINUTE_MS;

const PLOT_PAD_PX = 6;
const DOMAIN_PAD_SHARE = 0.1;
const LABEL_EDGE_SHARE = 0.18;

export interface TraceFrame extends NightFrame {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  readonly domain: TraceDomain;
}

export function pointsIn(points: readonly TracePoint[], window: NightWindow): TracePoint[] {
  return points
    .filter((point) => point.at >= window.from && point.at <= window.to)
    .sort((left, right) => left.at - right.at);
}

export function domainOf(
  points: readonly TracePoint[],
  given?: readonly [number, number],
): TraceDomain {
  if (given !== undefined) {
    return { min: Math.min(...given), max: Math.max(...given) };
  }
  const values = points.map((point) => point.value);
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = high > low ? (high - low) * DOMAIN_PAD_SHARE : Math.max(1, Math.abs(low) * 0.1);
  return { min: low - pad, max: high + pad };
}

export function traceFrameOf(input: {
  readonly window: NightWindow;
  readonly width: number;
  readonly height: number;
  readonly domain: TraceDomain;
}): TraceFrame {
  return {
    window: input.window,
    width: input.width,
    height: input.height,
    left: NIGHT_GUTTER_W,
    right: input.width - NIGHT_EDGE_PAD,
    top: PLOT_PAD_PX,
    bottom: input.height - PLOT_PAD_PX,
    domain: input.domain,
  };
}

export function valueY(frame: TraceFrame, value: number): number {
  const span = Math.max(1e-9, frame.domain.max - frame.domain.min);
  const share = Math.min(1, Math.max(0, (value - frame.domain.min) / span));
  return frame.bottom - share * (frame.bottom - frame.top);
}

export function lowestOf(points: readonly TracePoint[]): TracePoint | null {
  return points.reduce<TracePoint | null>(
    (lowest, point) => (lowest === null || point.value < lowest.value ? point : lowest),
    null,
  );
}

export function highestOf(points: readonly TracePoint[]): TracePoint | null {
  return points.reduce<TracePoint | null>(
    (highest, point) => (highest === null || point.value > highest.value ? point : highest),
    null,
  );
}

export function averageOf(points: readonly TracePoint[]): number | null {
  return points.length === 0
    ? null
    : points.reduce((sum, point) => sum + point.value, 0) / points.length;
}

export function ringedOf(points: readonly TracePoint[], below: number): TracePoint[] {
  return points.filter((point) => point.value < below);
}

export function cadenceOf(points: readonly TracePoint[]): number {
  const spacings = points
    .slice(1)
    .map((point, index) => point.at - (points[index]?.at ?? point.at))
    .sort((left, right) => left - right);
  return spacings[Math.floor(spacings.length / 2)] ?? 0;
}

export function valueAt(points: readonly TracePoint[], at: number): TracePoint | null {
  const reach = Math.max(TRACE_MAX_GAP_MS, cadenceOf(points) / 2);
  const nearest = points.reduce<TracePoint | null>(
    (best, point) =>
      best === null || Math.abs(point.at - at) < Math.abs(best.at - at) ? point : best,
    null,
  );
  return nearest !== null && Math.abs(nearest.at - at) <= reach ? nearest : null;
}

export function runsOf(points: readonly TracePoint[]): TracePoint[][] {
  const limit = Math.max(TRACE_MAX_GAP_MS, cadenceOf(points) * 2);
  const runs: TracePoint[][] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const run = runs[runs.length - 1];
    if (previous === undefined || run === undefined || point.at - previous.at > limit) {
      runs.push([point]);
    } else {
      run.push(point);
    }
  });
  return runs;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function linePathOf(points: readonly TracePoint[], frame: TraceFrame): string {
  return runsOf(points)
    .map((run) =>
      run
        .map((point, index) => {
          const x = round(nightX(frame, point.at));
          const y = round(valueY(frame, point.value));
          return `${index === 0 ? 'M' : 'L'}${String(x)} ${String(y)}`;
        })
        .join(''),
    )
    .join('');
}

export function gutterValuesOf(domain: TraceDomain, guide: number | undefined): number[] {
  const span = domain.max - domain.min;
  const inside =
    guide !== undefined &&
    guide > domain.min + span * LABEL_EDGE_SHARE &&
    guide < domain.max - span * LABEL_EDGE_SHARE;
  return inside ? [domain.max, guide, domain.min] : [domain.max, domain.min];
}

export function digitsOf(domain: TraceDomain): number {
  return domain.max - domain.min < 5 ? 1 : 0;
}

export function formatterOf(
  domain: TraceDomain,
  unit: string | undefined,
): (value: number) => string {
  const digits = digitsOf(domain);
  return (value) => withUnit(decimal(value, digits), unit);
}

export function gutterFormatterOf(domain: TraceDomain): (value: number) => string {
  const digits = digitsOf(domain);
  return (value) => decimal(value, digits);
}

export function readoutTextOf(point: TracePoint | null, format: (value: number) => string): string {
  return point === null ? 'No data' : format(point.value);
}

export function stepAt(
  points: readonly TracePoint[],
  at: number | null,
  direction: 1 | -1,
): number | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  if (at === null) {
    return (direction === 1 ? first : last).at;
  }
  const target =
    direction === 1
      ? (points.find((point) => point.at > at) ?? last)
      : (points.filter((point) => point.at < at).at(-1) ?? first);
  return target.at;
}

export function summaryOf(
  points: readonly TracePoint[],
  label: string,
  format: (value: number) => string,
): string {
  const lowest = lowestOf(points);
  const highest = highestOf(points);
  const average = averageOf(points);
  if (lowest === null || highest === null || average === null) {
    return `${label}: no data.`;
  }
  return `${label}. Average ${format(average)}, lowest ${format(lowest.value)} at ${clock(lowest.at)}, highest ${format(highest.value)} at ${clock(highest.at)}.`;
}
