import type { ChartPoint } from '../../../components/charts';

const CHART_BUCKETS = 600;

export function downsample(
  points: readonly ChartPoint[],
  from: number,
  to: number,
  buckets: number = CHART_BUCKETS,
): readonly ChartPoint[] {
  if (points.length <= buckets * 2 || to <= from) {
    return points;
  }
  const span = (to - from) / buckets;
  const lows = new Map<number, ChartPoint>();
  const highs = new Map<number, ChartPoint>();
  for (const point of points) {
    const bucket = Math.min(buckets - 1, Math.floor((point.t - from) / span));
    const low = lows.get(bucket);
    if (low === undefined || point.v < low.v) {
      lows.set(bucket, point);
    }
    const high = highs.get(bucket);
    if (high === undefined || point.v > high.v) {
      highs.set(bucket, point);
    }
  }
  const kept = new Set<ChartPoint>([...lows.values(), ...highs.values()]);
  const last = points[points.length - 1];
  if (last !== undefined) {
    kept.add(last);
  }
  return points.filter((point) => kept.has(point));
}
