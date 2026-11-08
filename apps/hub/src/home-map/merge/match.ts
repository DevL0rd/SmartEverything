import {
  appendTo,
  homeMapPolygonArea,
  type HomeMapPolygonShape,
  type HomeMapVec,
} from '@smarteverything/domain';

export const MATCH_MIN_OVERLAP = 0.5;

type Edge = readonly [HomeMapVec, HomeMapVec];
type Span = readonly [number, number];

const SLAB_EPS = 1e-12;
const SPAN_EPS = 1e-9;
const FLAT = 1e-12;

const allEdges = (polygon: HomeMapPolygonShape): readonly Edge[] =>
  [polygon.outer, ...polygon.holes].flatMap((ring) =>
    ring.map((point, index) => [point, ring[(index + 1) % ring.length] ?? point] as const),
  );

const slabEdges = (polygon: HomeMapPolygonShape): readonly Edge[] =>
  allEdges(polygon).filter(([a, b]) => a.x !== b.x);

function crossingX([a, b]: Edge, [c, d]: Edge): number | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? a.x + t * rx : null;
}

function slabBreaks(
  a: HomeMapPolygonShape,
  b: HomeMapPolygonShape,
  edgesA: readonly Edge[],
  edgesB: readonly Edge[],
): readonly number[] {
  const vertices = [a, b].flatMap((polygon) =>
    [polygon.outer, ...polygon.holes].flatMap((ring) => ring.map((point) => point.x)),
  );
  const crossings = edgesA.flatMap((ea) => edgesB.flatMap((eb) => crossingX(ea, eb) ?? []));
  return [...vertices, ...crossings].sort((p, q) => p - q);
}

function sectionAt(edges: readonly Edge[], x: number): readonly Span[] {
  const ys = edges
    .filter(([a, b]) => Math.min(a.x, b.x) < x && x < Math.max(a.x, b.x))
    .map(([a, b]) => a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
    .sort((p, q) => p - q);
  const spans: Span[] = [];
  for (let index = 0; index + 1 < ys.length; index += 2) {
    spans.push([ys[index] ?? 0, ys[index + 1] ?? 0]);
  }
  return spans;
}

const overlapLength = (a: readonly Span[], b: readonly Span[]): number =>
  a.reduce(
    (sum, [a0, a1]) =>
      sum +
      b.reduce((inner, [b0, b1]) => inner + Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)), 0),
    0,
  );

export function polygonIntersectionArea(a: HomeMapPolygonShape, b: HomeMapPolygonShape): number {
  const edgesA = slabEdges(a);
  const edgesB = slabEdges(b);
  const breaks = slabBreaks(a, b, edgesA, edgesB);
  let area = 0;
  for (let index = 0; index + 1 < breaks.length; index += 1) {
    const x0 = breaks[index] ?? 0;
    const x1 = breaks[index + 1] ?? 0;
    if (x1 - x0 <= SLAB_EPS) continue;
    const mid = (x0 + x1) / 2;
    area += (x1 - x0) * overlapLength(sectionAt(edgesA, mid), sectionAt(edgesB, mid));
  }
  return area;
}

export function polygonIou(a: HomeMapPolygonShape, b: HomeMapPolygonShape): number {
  const inter = polygonIntersectionArea(a, b);
  const union = homeMapPolygonArea(a) + homeMapPolygonArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

const present = (spans: readonly (Span | null)[]): readonly Span[] =>
  spans.filter((span): span is Span => span !== null);

const meet = (a: Span | null, b: Span | null): Span | null => {
  if (a === null || b === null) return null;
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
};

function linearSpan(c0: number, c1: number, lo: number, hi: number): Span | null {
  if (Math.abs(c1) < FLAT) return c0 >= lo && c0 <= hi ? [-Infinity, Infinity] : null;
  const t0 = (lo - c0) / c1;
  const t1 = (hi - c0) / c1;
  return [Math.min(t0, t1), Math.max(t0, t1)];
}

function circleSpan(
  from: HomeMapVec,
  step: HomeMapVec,
  centre: HomeMapVec,
  d: number,
): Span | null {
  const wx = from.x - centre.x;
  const wy = from.y - centre.y;
  const a = step.x * step.x + step.y * step.y;
  const b = wx * step.x + wy * step.y;
  const k = wx * wx + wy * wy - d * d;
  if (a < FLAT) return k <= 0 ? [-Infinity, Infinity] : null;
  const disc = b * b - a * k;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return [(-b - root) / a, (-b + root) / a];
}

function bandSpan(from: HomeMapVec, step: HomeMapVec, [q0, q1]: Edge, d: number): Span | null {
  const length = Math.hypot(q1.x - q0.x, q1.y - q0.y);
  if (length === 0) return null;
  const ux = (q1.x - q0.x) / length;
  const uy = (q1.y - q0.y) / length;
  const wx = from.x - q0.x;
  const wy = from.y - q0.y;
  const along = linearSpan(wx * ux + wy * uy, step.x * ux + step.y * uy, 0, length);
  const across = linearSpan(-wx * uy + wy * ux, -step.x * uy + step.y * ux, -d, d);
  return meet(along, across);
}

function capsuleSpan(from: HomeMapVec, step: HomeMapVec, edge: Edge, d: number): Span | null {
  const pieces = present([
    circleSpan(from, step, edge[0], d),
    circleSpan(from, step, edge[1], d),
    bandSpan(from, step, edge, d),
  ]);
  if (pieces.length === 0) return null;
  return meet([Math.min(...pieces.map((s) => s[0])), Math.max(...pieces.map((s) => s[1]))], [0, 1]);
}

function covers(spans: readonly Span[]): boolean {
  let reach = 0;
  for (const [lo, hi] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (lo > reach + SPAN_EPS) return false;
    reach = Math.max(reach, hi);
  }
  return reach >= 1 - SPAN_EPS;
}

const edgeWithin = (edge: Edge, others: readonly Edge[], d: number): boolean => {
  const step = { x: edge[1].x - edge[0].x, y: edge[1].y - edge[0].y };
  return covers(present(others.map((other) => capsuleSpan(edge[0], step, other, d))));
};

export function polygonBoundariesWithin(
  a: HomeMapPolygonShape,
  b: HomeMapPolygonShape,
  distance: number,
): boolean {
  const edgesA = allEdges(a);
  const edgesB = allEdges(b);
  return (
    edgesA.every((edge) => edgeWithin(edge, edgesB, distance)) &&
    edgesB.every((edge) => edgeWithin(edge, edgesA, distance))
  );
}

export interface MatchOld {
  readonly id: string;
  readonly ref: string;
  readonly polygon: HomeMapPolygonShape;
}

export interface MatchNew {
  readonly ref: string;
  readonly polygon: HomeMapPolygonShape;
}

export interface RoomMatching {
  readonly bound: ReadonlyMap<string, string>;
  readonly splits: ReadonlyMap<string, readonly string[]>;
  readonly unmatchedOld: readonly string[];
  readonly unmatchedNew: readonly string[];
}

interface Overlap {
  readonly oldId: string;
  readonly newRef: string;
  readonly iou: number;
  readonly coverage: number;
}

function bindByRef(olds: readonly MatchOld[], news: readonly MatchNew[]): Map<string, string> {
  const bound = new Map<string, string>();
  const taken = new Set<string>();
  for (const old of olds) {
    if (taken.has(old.ref) || !news.some((entry) => entry.ref === old.ref)) continue;
    bound.set(old.id, old.ref);
    taken.add(old.ref);
  }
  return bound;
}

function overlapsOf(olds: readonly MatchOld[], news: readonly MatchNew[]): readonly Overlap[] {
  return olds.flatMap((old) =>
    news.map((entry) => {
      const inter = polygonIntersectionArea(old.polygon, entry.polygon);
      const areaNew = homeMapPolygonArea(entry.polygon);
      const union = homeMapPolygonArea(old.polygon) + areaNew - inter;
      return {
        oldId: old.id,
        newRef: entry.ref,
        iou: union > 0 ? inter / union : 0,
        coverage: areaNew > 0 ? inter / areaNew : 0,
      };
    }),
  );
}

function bindByOverlap(overlaps: readonly Overlap[]): Map<string, string> {
  const bound = new Map<string, string>();
  const claimed = new Set<string>();
  const ranked = overlaps
    .map((overlap, index) => ({ overlap, index }))
    .filter(({ overlap }) => overlap.iou >= MATCH_MIN_OVERLAP)
    .sort((p, q) => q.overlap.iou - p.overlap.iou || p.index - q.index);
  for (const { overlap } of ranked) {
    if (bound.has(overlap.oldId) || claimed.has(overlap.newRef)) continue;
    bound.set(overlap.oldId, overlap.newRef);
    claimed.add(overlap.newRef);
  }
  return bound;
}

function splitsOf(overlaps: readonly Overlap[]): Map<string, string[]> {
  const best = new Map<string, Overlap>();
  for (const overlap of overlaps) {
    const held = best.get(overlap.newRef);
    if (overlap.coverage >= MATCH_MIN_OVERLAP && (!held || overlap.coverage > held.coverage)) {
      best.set(overlap.newRef, overlap);
    }
  }
  const groups = new Map<string, string[]>();
  for (const [newRef, overlap] of best) {
    appendTo(groups, overlap.oldId, newRef);
  }
  return new Map([...groups].filter(([, refs]) => refs.length >= 2));
}

export function matchRooms(olds: readonly MatchOld[], news: readonly MatchNew[]): RoomMatching {
  const exact = bindByRef(olds, news);
  const exactRefs = new Set(exact.values());
  const looseOlds = olds.filter((old) => !exact.has(old.id));
  const looseNews = news.filter((entry) => !exactRefs.has(entry.ref));
  const overlaps = overlapsOf(looseOlds, looseNews);
  const rebound = bindByOverlap(overlaps);
  const reboundRefs = new Set(rebound.values());
  const leftOlds = looseOlds.filter((old) => !rebound.has(old.id));
  const leftNews = looseNews.filter((entry) => !reboundRefs.has(entry.ref));
  const splits = splitsOf(
    overlaps.filter(
      (o) => leftOlds.some((old) => old.id === o.oldId) && leftNews.some((n) => n.ref === o.newRef),
    ),
  );
  const parts = new Set([...splits.values()].flat());
  return {
    bound: new Map([...exact, ...rebound]),
    splits,
    unmatchedOld: leftOlds.map((old) => old.id).filter((id) => !splits.has(id)),
    unmatchedNew: leftNews.map((entry) => entry.ref).filter((ref) => !parts.has(ref)),
  };
}
