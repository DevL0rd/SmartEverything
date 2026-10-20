import type { PluginDataPoint, WidgetStreamRef } from '@smarteverything/domain';
import type { ChartPoint } from '../../components/charts/scale';
import { numberReading, pickStreamValue } from './stream-value';

export const SERIES_KEPT = 200;

const MINUTE_MS = 60_000;

export function chartPointOf(
  point: PluginDataPoint,
  plugin: string,
  ref: WidgetStreamRef,
): ChartPoint | null {
  const reading = numberReading(
    pickStreamValue(
      { plugin_id: plugin, stream: point.stream, value: point.value, at: point.at },
      ref,
    ),
  );
  return reading.state === 'ready' ? { t: Date.parse(point.at), v: reading.value } : null;
}

export function chartPointsOf(
  points: readonly PluginDataPoint[],
  plugin: string,
  ref: WidgetStreamRef,
): readonly ChartPoint[] {
  return points.flatMap((point) => chartPointOf(point, plugin, ref) ?? []);
}

export function appendChartPoint(
  points: readonly ChartPoint[],
  point: ChartPoint | null,
): readonly ChartPoint[] {
  if (point === null) return points;
  const last = points.at(-1);
  if (last !== undefined && last.t >= point.t) return points;
  return [...points, point].slice(-SERIES_KEPT);
}

export function seriesWindow(
  history: readonly ChartPoint[],
  live: readonly ChartPoint[],
  minutes: number,
): readonly ChartPoint[] {
  const merged = new Map<number, ChartPoint>();
  for (const point of [...history, ...live]) merged.set(point.t, point);
  const ordered = [...merged.values()].sort((left, right) => left.t - right.t);
  const newest = ordered.at(-1);
  if (newest === undefined) return [];
  const since = newest.t - minutes * MINUTE_MS;
  return ordered.filter((point) => point.t >= since);
}
