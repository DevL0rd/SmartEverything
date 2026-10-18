import { scaleLinear } from 'd3-scale';
import { reduced } from '../../../components/charts/reduce';
import { areaPath, linePath, type ChartPoint } from '../../../components/charts/scale';
import { DAY_MS } from '../../../format/time';
import type { TimeSpan } from '../data/phone-history';

const CHART_WINDOW_MS = DAY_MS;
const LOW_LINE = 20;
const INSET = 2;

interface BatteryBand {
  readonly x: number;
  readonly width: number;
}

export interface BatteryShape {
  readonly lines: readonly { readonly line: string; readonly area: string }[];
  readonly bands: readonly BatteryBand[];
  readonly lowY: number;
  readonly end: { readonly x: number; readonly y: number } | null;
}

interface BatteryBox {
  readonly width: number;
  readonly height: number;
}

export function batteryShapeOf(
  points: readonly ChartPoint[],
  spans: readonly TimeSpan[],
  box: BatteryBox,
  now: number,
): BatteryShape {
  const x = scaleLinear([now - CHART_WINDOW_MS, now], [INSET, box.width - INSET]);
  const y = scaleLinear([0, 100], [box.height - INSET, INSET]);
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const last = sorted[sorted.length - 1];
  const held = last === undefined || last.t >= now ? sorted : [...sorted, { t: now, v: last.v }];
  const tip = held[held.length - 1];
  const placed = reduced(held, box.width).map((point) => ({ x: x(point.t), y: y(point.v) }));
  const lines =
    placed.length < 2 ? [] : [{ line: linePath(placed), area: areaPath(placed, box.height) }];
  const bands = spans.map((span) => {
    const from = Math.max(INSET, x(Math.max(span.start, now - CHART_WINDOW_MS)));
    return { x: from, width: Math.max(2, x(Math.min(span.end, now)) - from) };
  });
  return {
    lines,
    bands,
    lowY: y(LOW_LINE),
    end: tip === undefined ? null : { x: x(tip.t), y: y(tip.v) },
  };
}

export function chartSummary(
  points: readonly ChartPoint[],
  spans: readonly TimeSpan[],
  clockOf: (moment: number) => string,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return 'Battery today, no readings yet';
  const base = `Battery today, from ${String(Math.round(first.v))} to ${String(Math.round(last.v))} percent`;
  const charging = spans[spans.length - 1];
  return charging === undefined ? base : `${base}, charging since ${clockOf(charging.start)}`;
}
