export interface HomeMapVec {
  readonly x: number;
  readonly y: number;
}
export type HomeMapRingShape = readonly HomeMapVec[];
export interface HomeMapPolygonShape {
  readonly outer: HomeMapRingShape;
  readonly holes: readonly HomeMapRingShape[];
}
export interface HomeMapSegmentShape {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
}

export interface HomeMapWallSegment {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
  readonly thickness: number;
  readonly exterior: boolean;
}

export interface HomeMapWallsFromRingsOptions {
  readonly maxGap: number;
  readonly interior: number;
  readonly exterior: number;
}

export interface HomeMapWallHit<W extends HomeMapSegmentShape> {
  readonly wall: W;
  readonly offset: number;
  readonly distance: number;
}

export const HOME_MAP_WALL_THICKNESS = { interior: 0.1, exterior: 0.2 } as const;

export const HOME_MAP_NOOP_TOLERANCE = { vertexM: 0.02, areaFraction: 0.01 } as const;

export interface HomeMapNoopTolerance {
  readonly vertexM: number;
  readonly areaFraction: number;
}

export interface HomeMapToleranceScene {
  readonly rooms: readonly { readonly ref: string; readonly polygon: HomeMapPolygonShape }[];
  readonly walls: readonly (HomeMapSegmentShape & {
    readonly ref: string;
    readonly thickness: number;
    readonly kind: string;
  })[];
  readonly openings: readonly {
    readonly ref: string;
    readonly wallRef: string;
    readonly offset: number;
    readonly width: number;
    readonly kind: string;
  }[];
  readonly carpets?: readonly HomeMapRingShape[];
}

const EPS = 1e-9;
const PARALLEL = 1e-6;

export const homeMapDistance = (a: HomeMapVec, b: HomeMapVec): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const ringEdges = (ring: HomeMapRingShape): readonly (readonly [HomeMapVec, HomeMapVec])[] => {
  const edges: (readonly [HomeMapVec, HomeMapVec])[] = [];
  let previous = ring.at(-1);
  for (const current of ring) {
    if (previous) edges.push([previous, current]);
    previous = current;
  }
  return edges;
};

export const homeMapRingArea = (ring: HomeMapRingShape): number =>
  Math.abs(ringEdges(ring).reduce((sum, [a, b]) => sum + a.x * b.y - b.x * a.y, 0)) / 2;

export const homeMapPolygonArea = (polygon: HomeMapPolygonShape): number =>
  Math.max(
    0,
    homeMapRingArea(polygon.outer) -
      polygon.holes.reduce((sum, hole) => sum + homeMapRingArea(hole), 0),
  );

export const homeMapProjectOnSegment = (
  segment: HomeMapSegmentShape,
  point: HomeMapVec,
): { readonly offset: number; readonly distance: number; readonly point: HomeMapVec } => {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) {
    return { offset: 0, distance: homeMapDistance(segment.from, point), point: segment.from };
  }
  const offset = clamp(
    ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / length,
    0,
    length,
  );
  const foot = {
    x: segment.from.x + (dx / length) * offset,
    y: segment.from.y + (dy / length) * offset,
  };
  return { offset, distance: homeMapDistance(foot, point), point: foot };
};

type RingLocation = 'inside' | 'boundary' | 'outside';

const locateInRing = (ring: HomeMapRingShape, point: HomeMapVec): RingLocation => {
  let inside = false;
  for (const [a, b] of ringEdges(ring)) {
    if (homeMapProjectOnSegment({ from: a, to: b }, point).distance < 1e-9) return 'boundary';
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
};

export const homeMapPointInPolygon = (polygon: HomeMapPolygonShape, point: HomeMapVec): boolean => {
  if (locateInRing(polygon.outer, point) === 'outside') return false;
  return polygon.holes.every((hole) => locateInRing(hole, point) !== 'inside');
};

export const homeMapRoomAt = <T extends { readonly polygon: HomeMapPolygonShape }>(
  rooms: readonly T[],
  point: HomeMapVec,
): T | null => {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const room of rooms) {
    if (!homeMapPointInPolygon(room.polygon, point)) continue;
    const area = homeMapPolygonArea(room.polygon);
    if (area < bestArea) {
      best = room;
      bestArea = area;
    }
  }
  return best;
};

export const homeMapWallLength = (wall: HomeMapSegmentShape): number =>
  homeMapDistance(wall.from, wall.to);

export const homeMapWallPointAt = (wall: HomeMapSegmentShape, offset: number): HomeMapVec => {
  const length = homeMapWallLength(wall);
  if (length < EPS) return wall.from;
  const t = clamp(offset, 0, length) / length;
  return {
    x: wall.from.x + (wall.to.x - wall.from.x) * t,
    y: wall.from.y + (wall.to.y - wall.from.y) * t,
  };
};

export const homeMapNearestWall = <W extends HomeMapSegmentShape>(
  walls: readonly W[],
  point: HomeMapVec,
): HomeMapWallHit<W> | null => {
  let best: HomeMapWallHit<W> | null = null;
  for (const wall of walls) {
    const hit = homeMapProjectOnSegment(wall, point);
    if (!best || hit.distance < best.distance) {
      best = { wall, offset: hit.offset, distance: hit.distance };
    }
  }
  return best;
};

export const homeMapOpeningOffsetAt = (
  wall: HomeMapSegmentShape,
  point: HomeMapVec,
  width: number,
): number | null => {
  const length = homeMapWallLength(wall);
  if (width > length) return null;
  const centre = homeMapProjectOnSegment(wall, point).offset;
  return clamp(centre - width / 2, 0, length - width);
};

export const homeMapOpeningEnds = (
  wall: HomeMapSegmentShape,
  offset: number,
  width: number,
): HomeMapSegmentShape => ({
  from: homeMapWallPointAt(wall, offset),
  to: homeMapWallPointAt(wall, offset + width),
});

interface EdgeFrame {
  readonly a: HomeMapVec;
  readonly owner: number;
  readonly length: number;
  readonly ux: number;
  readonly uy: number;
}

interface Overlap {
  readonly lo: number;
  readonly hi: number;
  readonly gap: number;
  readonly owner: number;
}

const edgeFrames = (polygons: readonly HomeMapPolygonShape[]): readonly EdgeFrame[] =>
  polygons.flatMap((polygon, owner) =>
    [polygon.outer, ...polygon.holes].flatMap((ring) =>
      ringEdges(ring).flatMap(([a, b]) => {
        const length = homeMapDistance(a, b);
        if (length < EPS) return [];
        return [{ a, owner, length, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length }];
      }),
    ),
  );

const overlapOf = (e: EdgeFrame, f: EdgeFrame, maxGap: number): Overlap | null => {
  if (e.owner === f.owner || Math.abs(e.ux * f.uy - e.uy * f.ux) > PARALLEL) return null;
  const gap = (f.a.x - e.a.x) * -e.uy + (f.a.y - e.a.y) * e.ux;
  if (Math.abs(gap) > maxGap) return null;
  const ta = (f.a.x - e.a.x) * e.ux + (f.a.y - e.a.y) * e.uy;
  const tb = ta + f.length * (e.ux * f.ux + e.uy * f.uy);
  const lo = Math.max(0, Math.min(ta, tb));
  const hi = Math.min(e.length, Math.max(ta, tb));
  return hi - lo > EPS ? { lo, hi, gap, owner: f.owner } : null;
};

const uncovered = (length: number, overlaps: readonly Overlap[]): readonly [number, number][] => {
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const { lo, hi } of [...overlaps].sort((p, q) => p.lo - q.lo)) {
    if (lo - cursor > EPS) gaps.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (length - cursor > EPS) gaps.push([cursor, length]);
  return gaps;
};

const edgeSegment = (
  e: EdgeFrame,
  span: readonly [number, number],
  shift: number,
  wall: { readonly thickness: number; readonly exterior: boolean },
): HomeMapWallSegment => ({
  from: { x: e.a.x + e.ux * span[0] - e.uy * shift, y: e.a.y + e.uy * span[0] + e.ux * shift },
  to: { x: e.a.x + e.ux * span[1] - e.uy * shift, y: e.a.y + e.uy * span[1] + e.ux * shift },
  ...wall,
});

export const homeMapWallsFromRings = (
  polygons: readonly HomeMapPolygonShape[],
  options: HomeMapWallsFromRingsOptions,
): readonly HomeMapWallSegment[] => {
  const frames = edgeFrames(polygons);
  return frames.flatMap((e) => {
    const overlaps = frames.flatMap((f) => overlapOf(e, f, options.maxGap) ?? []);
    const outside = uncovered(e.length, overlaps).map((span) =>
      edgeSegment(e, span, 0, { thickness: options.exterior, exterior: true }),
    );
    const shared = overlaps
      .filter((overlap) => e.owner < overlap.owner)
      .map((o) =>
        edgeSegment(e, [o.lo, o.hi], o.gap / 2, { thickness: options.interior, exterior: false }),
      );
    return [...outside, ...shared];
  });
};

const vertexClose = (a: HomeMapVec, b: HomeMapVec, tolerance: number): boolean =>
  homeMapDistance(a, b) <= tolerance;

const shiftedRingClose = (
  a: HomeMapRingShape,
  b: HomeMapRingShape,
  shift: number,
  tolerance: number,
): boolean =>
  a.every((point, index) => {
    const other = b[(index + shift) % b.length];
    return other !== undefined && vertexClose(point, other, tolerance);
  });

const ringClose = (a: HomeMapRingShape, b: HomeMapRingShape, tolerance: number): boolean => {
  if (a.length !== b.length) return false;
  const reversed = [...b].reverse();
  return a.some(
    (_, shift) =>
      shiftedRingClose(a, b, shift, tolerance) || shiftedRingClose(a, reversed, shift, tolerance),
  );
};

const areaClose = (a: number, b: number, fraction: number): boolean =>
  Math.abs(a - b) <= fraction * Math.max(a, b);

const polygonClose = (
  a: HomeMapPolygonShape,
  b: HomeMapPolygonShape,
  tolerance: HomeMapNoopTolerance,
): boolean =>
  a.holes.length === b.holes.length &&
  ringClose(a.outer, b.outer, tolerance.vertexM) &&
  a.holes.every((hole, index) => {
    const other = b.holes[index];
    return other !== undefined && ringClose(hole, other, tolerance.vertexM);
  }) &&
  areaClose(homeMapPolygonArea(a), homeMapPolygonArea(b), tolerance.areaFraction);

const segmentClose = (a: HomeMapSegmentShape, b: HomeMapSegmentShape, tolerance: number): boolean =>
  (vertexClose(a.from, b.from, tolerance) && vertexClose(a.to, b.to, tolerance)) ||
  (vertexClose(a.from, b.to, tolerance) && vertexClose(a.to, b.from, tolerance));

const keyedClose = <T extends { readonly ref: string }>(
  base: readonly T[],
  next: readonly T[],
  close: (a: T, b: T) => boolean,
): boolean => {
  if (base.length !== next.length) return false;
  const byRef = new Map(next.map((item) => [item.ref, item]));
  return base.every((item) => {
    const other = byRef.get(item.ref);
    return other !== undefined && close(item, other);
  });
};

const carpetsClose = (
  base: readonly HomeMapRingShape[],
  next: readonly HomeMapRingShape[],
  tolerance: HomeMapNoopTolerance,
): boolean => {
  if (base.length !== next.length) return false;
  const free = [...next];
  return base.every((ring) => {
    const index = free.findIndex(
      (other) =>
        ringClose(ring, other, tolerance.vertexM) &&
        areaClose(homeMapRingArea(ring), homeMapRingArea(other), tolerance.areaFraction),
    );
    if (index < 0) return false;
    free.splice(index, 1);
    return true;
  });
};

export const homeMapSceneWithinTolerance = (
  base: HomeMapToleranceScene,
  next: HomeMapToleranceScene,
  tolerance: HomeMapNoopTolerance = HOME_MAP_NOOP_TOLERANCE,
): boolean =>
  keyedClose(base.rooms, next.rooms, (a, b) => polygonClose(a.polygon, b.polygon, tolerance)) &&
  keyedClose(
    base.walls,
    next.walls,
    (a, b) =>
      a.kind === b.kind &&
      Math.abs(a.thickness - b.thickness) <= tolerance.vertexM &&
      segmentClose(a, b, tolerance.vertexM),
  ) &&
  keyedClose(
    base.openings,
    next.openings,
    (a, b) =>
      a.kind === b.kind &&
      a.wallRef === b.wallRef &&
      Math.abs(a.offset - b.offset) <= tolerance.vertexM &&
      Math.abs(a.width - b.width) <= tolerance.vertexM,
  ) &&
  carpetsClose(base.carpets ?? [], next.carpets ?? [], tolerance);
