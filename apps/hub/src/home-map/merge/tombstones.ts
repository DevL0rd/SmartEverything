import {
  homeMapDistance,
  homeMapProjectOnSegment,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from '@smarteverything/domain';
import { RECTIFY_JOIN_MAX_GAP_M } from './rectify';

const WALL_PREFIX = 'wall:';
const OPENING_PREFIX = 'opening:';
const DECIMALS = 3;

export type Tombstone =
  | { readonly kind: 'wall'; readonly segment: HomeMapSegmentShape }
  | { readonly kind: 'opening'; readonly at: HomeMapVec; readonly width: number };

const num = (value: number): string => value.toFixed(DECIMALS);

const parseNumbers = (text: string, count: number): readonly number[] | null => {
  const parts = text.split(',');
  if (parts.length !== count) return null;
  const values = parts.map(Number);
  return values.every(Number.isFinite) ? values : null;
};

export function wallTombstone(wall: HomeMapSegmentShape): string {
  const ends = [wall.from, wall.to].sort((p, q) => p.x - q.x || p.y - q.y);
  return `${WALL_PREFIX}${ends.map((p) => `${num(p.x)},${num(p.y)}`).join(',')}`;
}

export function openingTombstone(at: HomeMapVec, width: number, kind: string): string {
  return `${OPENING_PREFIX}${kind}:${num(at.x)},${num(at.y)},${num(width)}`;
}

function parseWall(body: string): Tombstone | null {
  const [x0, y0, x1, y1] = parseNumbers(body, 4) ?? [];
  return x0 === undefined || y0 === undefined || x1 === undefined || y1 === undefined
    ? null
    : { kind: 'wall', segment: { from: { x: x0, y: y0 }, to: { x: x1, y: y1 } } };
}

function parseOpening(body: string): Tombstone | null {
  const [x, y, width] = parseNumbers(body.slice(body.indexOf(':') + 1), 3) ?? [];
  return x === undefined || y === undefined || width === undefined
    ? null
    : { kind: 'opening', at: { x, y }, width };
}

export function parseTombstone(text: string): Tombstone | null {
  if (text.startsWith(WALL_PREFIX)) return parseWall(text.slice(WALL_PREFIX.length));
  return text.startsWith(OPENING_PREFIX) ? parseOpening(text.slice(OPENING_PREFIX.length)) : null;
}

export const parseTombstones = (texts: readonly string[]): readonly Tombstone[] =>
  texts.flatMap((text) => parseTombstone(text) ?? []);

export function wallIsTombstoned(
  tombstones: readonly Tombstone[],
  wall: HomeMapSegmentShape,
): boolean {
  return tombstones.some(
    (stone) =>
      stone.kind === 'wall' &&
      [wall.from, wall.to].every(
        (end) => homeMapProjectOnSegment(stone.segment, end).distance <= RECTIFY_JOIN_MAX_GAP_M,
      ),
  );
}

export function openingIsTombstoned(
  tombstones: readonly Tombstone[],
  at: HomeMapVec,
  width: number,
): boolean {
  return tombstones.some(
    (stone) =>
      stone.kind === 'opening' && homeMapDistance(stone.at, at) <= Math.min(stone.width, width) / 2,
  );
}

export function mergeTombstones(
  held: readonly string[],
  added: readonly string[],
): readonly string[] {
  const fresh = [...new Set(added)].filter((text) => !held.includes(text));
  return fresh.length === 0 ? held : [...held, ...fresh];
}
