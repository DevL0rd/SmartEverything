import { zonedDateFormat } from '../../format/locale';
import { extentOf, type ChartPoint, type Extent, type Tick } from './scale';

export const SECOND_MS = 1000;
export const STICKY_SHRINK_MS = 30 * SECOND_MS;
const STICKY_HEADROOM = 1.08;
const STICKY_LOW_SHARE = 0.6;

export interface LiveWindow {
  readonly spanMs: number;
  readonly now: number;
}

export type YDomain = readonly [number, number] | 'sticky';

export interface StickyAxis {
  readonly max: number;
  readonly lowSince: number | null;
}

export const EMPTY_STICKY: StickyAxis = { max: 0, lowSince: null };

export function niceMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value > 0 ? value : 1));
  const fraction = value / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

export function nextSticky(state: StickyAxis, peak: number, now: number): StickyAxis {
  const need = niceMax(peak * STICKY_HEADROOM);
  if (need >= state.max) {
    return need === state.max && state.lowSince === null ? state : { max: need, lowSince: null };
  }
  if (peak >= state.max * STICKY_LOW_SHARE) {
    return state.lowSince === null ? state : { max: state.max, lowSince: null };
  }
  if (state.lowSince === null) {
    return { max: state.max, lowSince: now };
  }
  return now - state.lowSince > STICKY_SHRINK_MS ? { max: need, lowSince: null } : state;
}

export function domainOf(yDomain: YDomain, sticky: StickyAxis, peak: number): Extent {
  if (yDomain === 'sticky') {
    return { min: 0, max: sticky.max > 0 ? sticky.max : niceMax(peak * STICKY_HEADROOM) };
  }
  return { min: yDomain[0], max: yDomain[1] };
}

export function spanLabel(ms: number): string {
  if (ms >= 3_600_000) {
    return `${String(Math.round(ms / 3_600_000))} h`;
  }
  if (ms >= 60_000) {
    return `${String(Math.round(ms / 60_000))} min`;
  }
  return `${String(Math.round(ms / SECOND_MS))} s`;
}

export function liveWindowOf({ spanMs, now }: LiveWindow): Extent {
  return { min: now - spanMs, max: now };
}

export function liveTicks({ spanMs, now }: LiveWindow): Tick[] {
  return [
    { at: now - spanMs, label: `−${spanLabel(spanMs)}` },
    { at: now - spanMs / 2, label: `−${spanLabel(spanMs / 2)}` },
    { at: now, label: 'now' },
  ];
}

export function slideStep(plotWidth: number, spanMs: number): number {
  return (plotWidth / spanMs) * SECOND_MS;
}

const SECONDS_CLOCK = zonedDateFormat({ hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function liveLabel(at: number): string {
  return SECONDS_CLOCK(null).format(new Date(at));
}

export interface StackLayer {
  readonly label: string;
  readonly points: readonly ChartPoint[];
}

export function stacked(layers: readonly StackLayer[]): ChartPoint[][] {
  const running = new Map<number, number>();
  return layers.map((layer) =>
    layer.points.map((point) => {
      const total = point.v + (running.get(point.t) ?? 0);
      running.set(point.t, total);
      return { t: point.t, v: total };
    }),
  );
}

export function peakOf(layers: readonly (readonly ChartPoint[])[], window: Extent): number {
  const values = extentOf(
    layers.flatMap((points) =>
      points
        .filter((point) => point.t >= window.min && point.t <= window.max)
        .map((point) => point.v),
    ),
  );
  return values === null ? 0 : Math.max(0, values.max);
}

export interface LiveSummary {
  readonly peak: ChartPoint;
  readonly average: number;
}

export function liveSummary(points: readonly ChartPoint[]): LiveSummary | null {
  const [first] = points;
  if (first === undefined) {
    return null;
  }
  const peak = points.reduce((best, point) => (point.v > best.v ? point : best), first);
  const average = points.reduce((sum, point) => sum + point.v, 0) / points.length;
  return { peak, average };
}
