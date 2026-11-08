import type { RenderOpening, RenderPoint, RenderWall } from '../render-scene';

export interface WallPiece {
  readonly start: number;
  readonly end: number;
  readonly base: number;
  readonly top: number;
  readonly glass: boolean;
}

interface Interval {
  readonly start: number;
  readonly end: number;
  readonly opening: RenderOpening;
}

const ON_WALL_SLACK_METRES = 0.05;

const PARALLEL_COSINE = 0.98;

const GLAZED_OPENINGS: readonly RenderOpening['kind'][] = ['window'];

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

interface Axis {
  readonly from: RenderPoint;
  readonly along: RenderPoint;
  readonly length: number;
}

function axisOf(wall: RenderWall): Axis | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length === 0) return null;
  const along = { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
  return { from: wall.from, along, length };
}

const station = (axis: Axis, point: RenderPoint): number =>
  (point.x - axis.from.x) * axis.along.x + (point.y - axis.from.y) * axis.along.y;

const offset = (axis: Axis, point: RenderPoint): number =>
  Math.abs((point.x - axis.from.x) * axis.along.y - (point.y - axis.from.y) * axis.along.x);

function liesOnWall(axis: Axis, wall: RenderWall, opening: RenderOpening): boolean {
  const width = Math.hypot(opening.to.x - opening.from.x, opening.to.y - opening.from.y);
  if (width === 0) return false;
  const cosine =
    Math.abs(
      (opening.to.x - opening.from.x) * axis.along.x +
        (opening.to.y - opening.from.y) * axis.along.y,
    ) / width;
  const slack = wall.thickness / 2 + ON_WALL_SLACK_METRES;
  return (
    cosine >= PARALLEL_COSINE &&
    offset(axis, opening.from) <= slack &&
    offset(axis, opening.to) <= slack
  );
}

function intervalOf(axis: Axis, wall: RenderWall, opening: RenderOpening): Interval | null {
  if (opening.wallId !== null && opening.wallId !== wall.id) return null;
  if (opening.wallId === null && !liesOnWall(axis, wall, opening)) return null;
  const ends = [station(axis, opening.from), station(axis, opening.to)];
  const start = clamp(Math.min(...ends), 0, axis.length);
  const end = clamp(Math.max(...ends), 0, axis.length);
  return end > start ? { start, end, opening } : null;
}

function openingPieces(interval: Interval, height: number): readonly WallPiece[] {
  const { start, end, opening } = interval;
  const sill = clamp(opening.sillHeight, 0, height);
  const head = clamp(opening.headHeight, sill, height);
  const pieces: WallPiece[] = [];
  if (sill > 0) pieces.push({ start, end, base: 0, top: sill, glass: false });
  if (GLAZED_OPENINGS.includes(opening.kind) && head > sill) {
    pieces.push({ start, end, base: sill, top: head, glass: true });
  }
  if (head < height) pieces.push({ start, end, base: head, top: height, glass: false });
  return pieces;
}

export function wallPieces(
  wall: RenderWall,
  height: number,
  openings: readonly RenderOpening[],
): readonly WallPiece[] {
  const axis = axisOf(wall);
  if (axis === null || height <= 0) return [];
  const glass = wall.kind === 'glass';
  const intervals = openings
    .flatMap((opening) => {
      const interval = intervalOf(axis, wall, opening);
      return interval === null ? [] : [interval];
    })
    .sort((left, right) => left.start - right.start);
  const pieces: WallPiece[] = [];
  let cursor = 0;
  for (const interval of intervals) {
    const start = Math.max(cursor, interval.start);
    if (start > cursor) pieces.push({ start: cursor, end: start, base: 0, top: height, glass });
    if (interval.end > start) pieces.push(...openingPieces({ ...interval, start }, height));
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < axis.length) {
    pieces.push({ start: cursor, end: axis.length, base: 0, top: height, glass });
  }
  return pieces;
}
