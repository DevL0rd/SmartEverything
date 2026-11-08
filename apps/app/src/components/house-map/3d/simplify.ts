import type { RenderPoint } from '../render-scene';

function distanceToSegment(point: RenderPoint, from: RenderPoint, to: RenderPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  if (squared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const along = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared),
  );
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

function farthest(
  points: readonly RenderPoint[],
  first: number,
  last: number,
): { readonly index: number; readonly distance: number } {
  const from = points[first];
  const to = points[last];
  let found = { index: first, distance: 0 };
  if (from === undefined || to === undefined) return found;
  for (let index = first + 1; index < last; index += 1) {
    const point = points[index];
    const distance = point === undefined ? 0 : distanceToSegment(point, from, to);
    if (distance > found.distance) found = { index, distance };
  }
  return found;
}

export function simplifyPoints<T extends RenderPoint>(
  points: readonly T[],
  tolerance: number,
): T[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const pending: (readonly [number, number])[] = [[0, points.length - 1]];
  for (let range = pending.pop(); range !== undefined; range = pending.pop()) {
    const [first, last] = range;
    const split = farthest(points, first, last);
    if (split.distance > tolerance) {
      keep[split.index] = 1;
      pending.push([first, split.index], [split.index, last]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}
