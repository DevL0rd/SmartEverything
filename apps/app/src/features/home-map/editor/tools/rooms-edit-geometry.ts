import {
  homeMapDistance,
  homeMapPointInPolygon,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import type {
  EditGhost,
  EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { areaText, cleanRing, metresText, validRing, type DrawRing } from './rooms-draw-geometry';

export const SHARED_EDGE_M = 0.01;

const EPS = 1e-9;

interface Cut {
  readonly index: number;
  readonly point: HomeMapVec;
  readonly along: number;
}

const cross2 = (a: HomeMapVec, b: HomeMapVec): number => a.x * b.y - a.y * b.x;

const minus = (a: HomeMapVec, b: HomeMapVec): HomeMapVec => ({ x: a.x - b.x, y: a.y - b.y });

const lerp = (a: HomeMapVec, b: HomeMapVec, t: number): HomeMapVec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function signedRingArea(ring: DrawRing): number {
  return (
    ring.reduce((sum, a, index) => {
      const b = ring[(index + 1) % ring.length] ?? a;
      return sum + cross2(a, b);
    }, 0) / 2
  );
}

function cutOf(ring: DrawRing, index: number, from: HomeMapVec, dir: HomeMapVec): Cut | null {
  const p = ring[index];
  const q = ring[(index + 1) % ring.length];
  if (p === undefined || q === undefined) return null;
  const edge = minus(q, p);
  const denom = cross2(dir, edge);
  if (Math.abs(denom) < EPS) return null;
  const offset = minus(p, from);
  const along = cross2(offset, edge) / denom;
  const onEdge = cross2(offset, dir) / denom;
  if (onEdge < 0 || onEdge >= 1) return null;
  return { index, point: lerp(p, q, onEdge), along };
}

function lineCuts(ring: DrawRing, from: HomeMapVec, to: HomeMapVec): readonly Cut[] {
  const dir = minus(to, from);
  return ring
    .map((_, index) => cutOf(ring, index, from, dir))
    .filter((cut): cut is Cut => cut !== null)
    .sort((a, b) => a.along - b.along);
}

function chordNearest(ring: DrawRing, cuts: readonly Cut[]): readonly [Cut, Cut] | null {
  let best: readonly [Cut, Cut] | null = null;
  let bestGap = Infinity;
  cuts.forEach((first, at) => {
    const second = cuts[at + 1];
    if (second === undefined || second.along - first.along < EPS) return;
    const middle = lerp(first.point, second.point, 0.5);
    if (!homeMapPointInPolygon({ outer: ring, holes: [] }, middle)) return;
    const gap = Math.abs((first.along + second.along) / 2 - 0.5);
    if (gap < bestGap) {
      best = [first, second];
      bestGap = gap;
    }
  });
  return best;
}

function slice(ring: DrawRing, fromIndex: number, toIndex: number): readonly HomeMapVec[] {
  const out: HomeMapVec[] = [];
  for (let at = fromIndex; at !== toIndex; at = (at + 1) % ring.length) {
    const point = ring[(at + 1) % ring.length];
    if (point !== undefined) out.push(point);
  }
  return out;
}

export function splitRing(
  ring: DrawRing,
  from: HomeMapVec,
  to: HomeMapVec,
): readonly [DrawRing, DrawRing] | null {
  if (homeMapDistance(from, to) < SHARED_EDGE_M) return null;
  const chord = chordNearest(ring, lineCuts(ring, from, to));
  if (chord === null) return null;
  const [a, b] = chord[0].index <= chord[1].index ? chord : [chord[1], chord[0]];
  if (a.index === b.index) return null;
  const left = cleanRing([a.point, ...slice(ring, a.index, b.index), b.point]);
  const right = cleanRing([b.point, ...slice(ring, b.index, a.index), a.point]);
  return validRing(left) && validRing(right) ? [left, right] : null;
}

const same = (a: HomeMapVec, b: HomeMapVec): boolean => homeMapDistance(a, b) < SHARED_EDGE_M;

function along(point: HomeMapVec, p: HomeMapVec, q: HomeMapVec): number | null {
  const edge = minus(q, p);
  const length = Math.hypot(edge.x, edge.y);
  if (length < EPS) return null;
  const offset = minus(point, p);
  const t = (offset.x * edge.x + offset.y * edge.y) / (length * length);
  if (t * length < SHARED_EDGE_M || (1 - t) * length < SHARED_EDGE_M) return null;
  return Math.abs(cross2(offset, edge)) / length < SHARED_EDGE_M ? t : null;
}

function withJoints(ring: DrawRing, other: DrawRing): readonly HomeMapVec[] {
  return ring.flatMap((p, index) => {
    const q = ring[(index + 1) % ring.length] ?? p;
    const inner = other
      .flatMap((point) => {
        const t = along(point, p, q);
        return t === null ? [] : [{ point, t }];
      })
      .sort((x, y) => x.t - y.t)
      .map((hit) => hit.point);
    return [p, ...inner];
  });
}

type Edge = readonly [HomeMapVec, HomeMapVec];

function edgesOf(ring: readonly HomeMapVec[]): readonly Edge[] {
  return ring.map((p, index): Edge => [p, ring[(index + 1) % ring.length] ?? p]);
}

function ccw(ring: DrawRing): DrawRing {
  return signedRingArea(ring) < 0 ? [...ring].reverse() : ring;
}

function outerEdges(a: DrawRing, b: DrawRing): readonly Edge[] | null {
  const ea = edgesOf(withJoints(ccw(a), b));
  const eb = edgesOf(withJoints(ccw(b), a));
  const twin = (edge: Edge, list: readonly Edge[]): boolean =>
    list.some(([p, q]) => same(p, edge[1]) && same(q, edge[0]));
  const keptA = ea.filter((edge) => !twin(edge, eb));
  const keptB = eb.filter((edge) => !twin(edge, ea));
  if (keptA.length === ea.length) return null;
  return [...keptA, ...keptB];
}

function chain(edges: readonly Edge[]): readonly HomeMapVec[] | null {
  const first = edges[0];
  if (first === undefined) return null;
  const left = edges.slice(1);
  const ring: HomeMapVec[] = [first[0]];
  let end = first[1];
  while (left.length > 0) {
    const next = left.filter(([p]) => same(p, end));
    const step = next[0];
    if (next.length !== 1 || step === undefined) return null;
    left.splice(left.indexOf(step), 1);
    ring.push(step[0]);
    end = step[1];
  }
  return same(end, first[0]) ? ring : null;
}

function straightened(ring: readonly HomeMapVec[]): DrawRing {
  return ring.filter((point, index) => {
    const prev = ring[(index + ring.length - 1) % ring.length] ?? point;
    const next = ring[(index + 1) % ring.length] ?? point;
    const length = homeMapDistance(prev, next);
    if (length < EPS) return true;
    return Math.abs(cross2(minus(point, prev), minus(next, prev))) / length >= SHARED_EDGE_M;
  });
}

export function mergeRings(a: DrawRing, b: DrawRing): DrawRing | null {
  const edges = outerEdges(a, b);
  const joined = edges === null ? null : chain(edges);
  if (joined === null) return null;
  const ring = cleanRing(straightened(joined));
  return validRing(ring) ? ring : null;
}

export function touching(a: DrawRing, b: DrawRing): boolean {
  return outerEdges(a, b) !== null;
}

export function insertCorner(ring: DrawRing, side: number): DrawRing | null {
  const from = ring[side];
  const to = ring[(side + 1) % ring.length];
  if (from === undefined || to === undefined) return null;
  const middle = lerp(from, to, 0.5);
  return [...ring.slice(0, side + 1), middle, ...ring.slice(side + 1)];
}

export function withCorner(ring: DrawRing, index: number, point: HomeMapVec): DrawRing | null {
  if (ring[index] === undefined) return null;
  return ring.map((each, at) => (at === index ? point : each));
}

export function withoutCorner(ring: DrawRing, index: number): DrawRing | null {
  if (ring[index] === undefined || ring.length <= 3) return null;
  return ring.filter((_, at) => at !== index);
}

export function sideNormal(from: HomeMapVec, to: HomeMapVec): HomeMapVec | null {
  const length = homeMapDistance(from, to);
  if (length < EPS) return null;
  return { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
}

export function pushedSide(ring: DrawRing, side: number, offset: number): DrawRing | null {
  const last = (side + 1) % ring.length;
  const from = ring[side];
  const to = ring[last];
  const normal = from === undefined || to === undefined ? null : sideNormal(from, to);
  if (normal === null) return null;
  const by = { x: normal.x * offset, y: normal.y * offset };
  return ring.map((point, at) =>
    at === side || at === last ? { x: point.x + by.x, y: point.y + by.y } : point,
  );
}

export interface RingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function ringBox(ring: DrawRing): RingBox {
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export type SizeAxis = 'x' | 'y';

export function ringSize(ring: DrawRing, axis: SizeAxis): number {
  const box = ringBox(ring);
  return axis === 'x' ? box.maxX - box.minX : box.maxY - box.minY;
}

export function resizedPoints<P extends HomeMapVec>(
  points: readonly P[],
  box: RingBox,
  axis: SizeAxis,
  size: number,
): P[] {
  const span = axis === 'x' ? box.maxX - box.minX : box.maxY - box.minY;
  const centre = axis === 'x' ? (box.minX + box.maxX) / 2 : (box.minY + box.maxY) / 2;
  const factor = span < EPS ? 1 : size / span;
  return points.map((point) =>
    axis === 'x'
      ? { ...point, x: centre + (point.x - centre) * factor }
      : { ...point, y: centre + (point.y - centre) * factor },
  );
}

type EditHandle = EditOverlay['handles'][number];

type EditLabel = EditOverlay['labels'][number];

export type RoomHandleKind = 'corner' | 'side';

export interface RoomHandle {
  readonly kind: RoomHandleKind;
  readonly index: number;
  readonly handle: EditHandle;
}

const onGround = (point: HomeMapVec): EditHandle['at'] => ({ x: point.x, y: point.y, height: 0 });

function cornerHandle(roomId: string, index: number, point: HomeMapVec): RoomHandle {
  const handle: EditHandle = {
    id: `room-corner:${roomId}:${String(index)}`,
    kind: 'point',
    at: onGround(point),
    surface: { kind: 'ground' },
    target: { kind: 'room-corner', roomId, index },
  };
  return { kind: 'corner', index, handle };
}

function sideHandle(roomId: string, index: number, point: HomeMapVec): RoomHandle {
  const handle: EditHandle = {
    id: `room-side:${roomId}:${String(index)}`,
    kind: 'edge',
    at: onGround(point),
    surface: { kind: 'ground' },
    target: { kind: 'room-side', roomId, index },
  };
  return { kind: 'side', index, handle };
}

export function roomHandles(room: HomeMapRoom): readonly RoomHandle[] {
  const ring = room.polygon.outer;
  const corners = ring.map((point, index) => cornerHandle(room.id, index, point));
  const sides = ring.flatMap((from, index) => {
    const to = ring[(index + 1) % ring.length] ?? from;
    if (homeMapDistance(from, to) < EPS) return [];
    return [sideHandle(room.id, index, lerp(from, to, 0.5))];
  });
  return [...corners, ...sides];
}

export function handleNear(
  handles: readonly RoomHandle[],
  at: HomeMapVec,
  radiusM: number,
): RoomHandle | null {
  let best: { readonly handle: RoomHandle; readonly gap: number } | null = null;
  for (const handle of handles) {
    const gap = homeMapDistance(handle.handle.at, at);
    if (gap <= radiusM && (best === null || gap < best.gap)) best = { handle, gap };
  }
  return best?.handle ?? null;
}

export function sizeText(ring: DrawRing): string {
  const width = ringSize(ring, 'x');
  const depth = ringSize(ring, 'y');
  return `${width.toFixed(2)} × ${metresText(depth)} · ${areaText(ring)}`;
}

export function cornerText(point: HomeMapVec): string {
  return `X ${point.x.toFixed(2)}  Y ${point.y.toFixed(2)}`;
}

export function lowestSideMiddle(ring: DrawRing): HomeMapVec {
  const middles = ring.map((from, index) =>
    lerp(from, ring[(index + 1) % ring.length] ?? from, 0.5),
  );
  return middles.reduce(
    (low, point) => (point.y < low.y ? point : low),
    middles[0] ?? { x: 0, y: 0 },
  );
}

export interface RoomMarks {
  readonly ghosts: readonly EditGhost[];
  readonly labels: readonly EditLabel[];
}

export function roomMarks(room: HomeMapRoom, corner: number | null): RoomMarks {
  const ring = room.polygon.outer;
  const [first] = ring;
  if (first === undefined) return { ghosts: [], labels: [] };
  const outline: EditGhost = {
    shape: 'polyline',
    points: [...ring, first].map(onGround),
    tone: 'accent',
  };
  const size: EditLabel = {
    at: onGround(lowestSideMiddle(ring)),
    text: sizeText(ring),
    tone: 'neutral',
  };
  const point = corner === null ? undefined : ring[corner];
  const picked: readonly EditLabel[] =
    point === undefined ? [] : [{ at: onGround(point), text: cornerText(point), tone: 'accent' }];
  return { ghosts: [outline], labels: [...picked, size] };
}
