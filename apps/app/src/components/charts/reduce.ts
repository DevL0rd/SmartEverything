import type { ChartPoint } from './scale';

interface Column {
  first: number;
  last: number;
  low: number;
  high: number;
}

function columnsOf(points: readonly ChartPoint[], count: number): Map<number, Column> {
  const start = points[0]?.t ?? 0;
  const span = Math.max((points[points.length - 1]?.t ?? 0) - start, 1);
  const columns = new Map<number, Column>();
  points.forEach((point, index) => {
    const key = Math.min(count - 1, Math.floor(((point.t - start) / span) * count));
    const column = columns.get(key);
    if (column === undefined) {
      columns.set(key, { first: index, last: index, low: index, high: index });
      return;
    }
    column.last = index;
    column.low = point.v < (points[column.low]?.v ?? point.v) ? index : column.low;
    column.high = point.v > (points[column.high]?.v ?? point.v) ? index : column.high;
  });
  return columns;
}

export function reduced(points: readonly ChartPoint[], width: number): readonly ChartPoint[] {
  const count = Math.max(1, Math.floor(width));
  if (points.length <= count * 2) {
    return points;
  }
  const keep = new Set<number>();
  for (const column of columnsOf(points, count).values()) {
    keep.add(column.first);
    keep.add(column.low);
    keep.add(column.high);
    keep.add(column.last);
  }
  return [...keep].sort((a, b) => a - b).flatMap((index) => points[index] ?? []);
}
