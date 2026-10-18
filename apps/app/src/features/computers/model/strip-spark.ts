import type { ChartPoint } from '../../../components/charts';

const GAP_MS = 5000;
const SPAN_MS = 90_000;
const BUCKETS = 18;
const MIN_BUCKETS = 4;
const MIN_RANGE = 1;
const MIN_STEP_MS = 1000;

function trailingRun(points: readonly ChartPoint[]): readonly ChartPoint[] {
  const newest = points[points.length - 1];
  if (newest === undefined) return [];
  let start = points.length - 1;
  while (start > 0) {
    const here = points[start];
    const before = points[start - 1];
    if (here === undefined || before === undefined || here.t - before.t > GAP_MS) break;
    start -= 1;
  }
  return points.slice(start).filter((point) => point.t >= newest.t - SPAN_MS);
}

function averaged(run: readonly ChartPoint[]): readonly ChartPoint[] {
  const first = run[0];
  const last = run[run.length - 1];
  if (first === undefined || last === undefined) return [];
  const step = Math.max(MIN_STEP_MS, (last.t - first.t) / BUCKETS);
  const buckets = new Map<number, { t: number; v: number; n: number }>();
  for (const point of run) {
    const key = Math.min(BUCKETS, Math.floor((point.t - first.t) / step));
    const bucket = buckets.get(key) ?? { t: 0, v: 0, n: 0 };
    bucket.t += point.t;
    bucket.v += point.v;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  return [...buckets]
    .sort(([left], [right]) => left - right)
    .map(([, bucket]) => ({ t: bucket.t / bucket.n, v: bucket.v / bucket.n }));
}

export function sparkOf(points: readonly ChartPoint[]): readonly ChartPoint[] | null {
  const smooth = averaged(trailingRun(points));
  if (smooth.length < MIN_BUCKETS) return null;
  const values = smooth.map((point) => point.v);
  const range = Math.max(...values) - Math.min(...values);
  return range < MIN_RANGE ? null : smooth;
}
