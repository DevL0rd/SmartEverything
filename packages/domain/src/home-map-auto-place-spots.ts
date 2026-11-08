import {
  homeMapDistance,
  homeMapNearestWall,
  homeMapPointInPolygon,
  homeMapProjectOnSegment,
  homeMapWallPointAt,
  type HomeMapPolygonShape,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from './home-map-geometry';
import {
  AUTO_EPS,
  autoAlong,
  autoAngleDeg,
  autoBoundaryDistance,
  autoBounds,
  autoGridSpots,
  autoKey,
  autoPole,
  autoRectClear,
  autoRectsOverlap,
  autoSub,
  autoUnit,
  autoWallEdges,
  type AutoRect,
  type AutoSize,
  type AutoWallEdge,
} from './home-map-auto-place-shapes';
import {
  HOME_MAP_AUTO_PLACE as A,
  type HomeMapAutoFacts,
  type HomeMapAutoOccupant,
  type HomeMapAutoPlaceInput,
  type HomeMapAutoRole,
} from './home-map-auto-place-types';

export interface AutoCandidate {
  readonly boundary: HomeMapVec;
  readonly at: HomeMapVec;
  readonly rotation: number;
}

interface Corner {
  readonly vertex: HomeMapVec;
  readonly bisector: HomeMapVec;
}

interface Cell {
  readonly at: HomeMapVec;
  readonly boundary: number;
  readonly corner: number;
}

interface WallUse {
  readonly boundary: HomeMapVec;
  readonly half: number;
}

interface FloorUse {
  readonly rect: AutoRect;
  readonly h: number;
}

export interface AutoContext {
  readonly polygon: HomeMapPolygonShape;
  readonly ceilingHeight: number;
  readonly centre: HomeMapVec;
  readonly edges: readonly AutoWallEdge[];
  readonly corners: readonly Corner[];
  readonly openings: readonly HomeMapSegmentShape[];
  readonly cellsByWall: readonly Cell[];
  readonly cellsByCorner: readonly Cell[];
  readonly floorUses: FloorUse[];
  readonly wallUses: WallUse[];
}

type ContextBase = Omit<AutoContext, 'cellsByWall' | 'cellsByCorner'>;

const cornersOf = (polygon: HomeMapPolygonShape, centre: HomeMapVec): readonly Corner[] => {
  const ring = polygon.outer;
  const found = ring.flatMap((vertex, index) => {
    const prev = ring[(index + ring.length - 1) % ring.length];
    const next = ring[(index + 1) % ring.length];
    if (!prev || !next) return [];
    const a = autoUnit(autoSub(prev, vertex));
    const b = autoUnit(autoSub(next, vertex));
    const sum = { x: a.x + b.x, y: a.y + b.y };
    if (Math.hypot(sum.x, sum.y) < 1e-6) return [];
    const bisector = autoUnit(sum);
    return homeMapPointInPolygon(polygon, autoAlong(vertex, bisector, 0.05))
      ? [{ vertex, bisector }]
      : [];
  });
  return found.sort(
    (p, q) =>
      autoKey(homeMapDistance(q.vertex, centre)) - autoKey(homeMapDistance(p.vertex, centre)),
  );
};

const floorCells = (base: ContextBase): readonly Cell[] => {
  const box = autoBounds(base.polygon.outer);
  const size = A.floorCellM;
  const cells: Cell[] = [];
  for (let j = Math.ceil(box.y / size); j * size <= box.y + box.h; j += 1) {
    for (let i = Math.ceil(box.x / size); i * size <= box.x + box.w; i += 1) {
      const at = { x: i * size, y: j * size };
      if (!homeMapPointInPolygon(base.polygon, at)) continue;
      cells.push({
        at,
        boundary: autoBoundaryDistance(base.edges, at),
        corner: Math.min(Infinity, ...base.corners.map((c) => homeMapDistance(c.vertex, at))),
      });
    }
  }
  return cells;
};

const ordered = (cells: readonly Cell[], rank: (c: Cell) => readonly number[]): readonly Cell[] =>
  [...cells].sort((p, q) => {
    const rp = rank(p);
    const rq = rank(q);
    const first = rp.findIndex((value, i) => value !== rq[i]);
    return first < 0 ? 0 : (rp[first] ?? 0) - (rq[first] ?? 0);
  });

const registerOccupant = (
  ctx: AutoContext,
  occupant: HomeMapAutoOccupant,
  facts: HomeMapAutoFacts,
): void => {
  const { w, d, h } = facts.footprint;
  if (facts.mount === 'wall') {
    const hit = homeMapNearestWall(ctx.edges, occupant.at);
    if (hit) ctx.wallUses.push({ boundary: homeMapWallPointAt(hit.wall, hit.offset), half: w / 2 });
    return;
  }
  if (facts.mount === 'floor' || facts.mount === 'table') {
    ctx.floorUses.push({ rect: { at: occupant.at, w, d, rotation: occupant.rotation }, h });
  }
};

const sortedOpenings = (openings: readonly HomeMapSegmentShape[]): readonly HomeMapSegmentShape[] =>
  [...openings].sort(
    (p, q) =>
      autoKey(p.from.x - q.from.x) ||
      autoKey(p.from.y - q.from.y) ||
      autoKey(p.to.x - q.to.x) ||
      autoKey(p.to.y - q.to.y),
  );

export const autoBuildContext = (input: HomeMapAutoPlaceInput): AutoContext => {
  const { polygon, ceilingHeight } = input.room;
  const edges = autoWallEdges(polygon);
  const centre = autoPole(polygon, edges).p;
  const base: ContextBase = {
    polygon,
    ceilingHeight,
    centre,
    edges,
    corners: cornersOf(polygon, centre),
    openings: sortedOpenings(input.openings),
    floorUses: [],
    wallUses: [],
  };
  const cells = floorCells(base);
  const ctx: AutoContext = {
    ...base,
    cellsByWall: ordered(cells, (c) => [autoKey(c.boundary), autoKey(c.at.y), autoKey(c.at.x)]),
    cellsByCorner: ordered(cells, (c) => [
      autoKey(c.corner),
      autoKey(c.boundary),
      autoKey(c.at.y),
      autoKey(c.at.x),
    ]),
  };
  for (const occupant of input.occupants) {
    registerOccupant(ctx, occupant, input.facts(occupant.modelId));
  }
  return ctx;
};

export const autoCeilingSpots = (ctx: AutoContext, count: number): readonly HomeMapVec[] => {
  const pole = autoPole(ctx.polygon, ctx.edges);
  if (count === 1) return [pole.p];
  return autoGridSpots(ctx.polygon, ctx.edges, count, Math.min(0.2, pole.s / 2));
};

const wallCandidate = (edge: AutoWallEdge, offset: number, size: AutoSize): AutoCandidate => {
  const boundary = autoAlong(edge.from, edge.dir, offset);
  return {
    boundary,
    at: autoAlong(boundary, edge.normal, size.d / 2),
    rotation: autoAngleDeg(edge.normal),
  };
};

const edgeCandidates = (edge: AutoWallEdge, size: AutoSize): readonly AutoCandidate[] => {
  const margin = size.w / 2 + A.wallEdgeMarginM;
  if (edge.length < 2 * margin) return [];
  const mid = edge.length / 2;
  const offsets = [mid];
  for (let k = 1; mid - k * A.wallStepM >= margin - AUTO_EPS; k += 1) {
    offsets.push(mid - k * A.wallStepM, mid + k * A.wallStepM);
  }
  return offsets.map((offset) => wallCandidate(edge, offset, size));
};

const spotFree = (
  ctx: AutoContext,
  candidate: AutoCandidate,
  size: AutoSize,
  height: number,
): boolean => {
  const rect = { at: candidate.at, w: size.w, d: size.d, rotation: candidate.rotation };
  const half = size.w / 2;
  return (
    ctx.wallUses.every((u) => homeMapDistance(u.boundary, candidate.boundary) >= u.half + half) &&
    ctx.openings.every(
      (o) => homeMapProjectOnSegment(o, candidate.boundary).distance >= half + A.openingMarginM,
    ) &&
    ctx.floorUses.every((o) => o.h < height || !autoRectsOverlap(o.rect, rect))
  );
};

const crowding = (ctx: AutoContext, candidate: AutoCandidate): number =>
  Math.min(Infinity, ...ctx.wallUses.map((u) => homeMapDistance(u.boundary, candidate.boundary)));

const bestFree = (
  ctx: AutoContext,
  candidates: readonly AutoCandidate[],
  size: AutoSize,
  height: number,
): AutoCandidate | null => {
  let best: AutoCandidate | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (!spotFree(ctx, candidate, size, height)) continue;
    const score = crowding(ctx, candidate);
    if (best === null || score > bestScore + AUTO_EPS) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

const centredSpot = (ctx: AutoContext, size: AutoSize, height: number): AutoCandidate | null => {
  for (const edge of ctx.edges) {
    const found = edgeCandidates(edge, size).find((c) => spotFree(ctx, c, size, height));
    if (found) return found;
  }
  return null;
};

const switchSpot = (ctx: AutoContext, size: AutoSize, height: number): AutoCandidate | null => {
  const margin = size.w / 2 + A.wallEdgeMarginM;
  for (const opening of ctx.openings) {
    const dir = autoUnit(autoSub(opening.to, opening.from));
    for (const sign of [1, -1]) {
      const end = sign > 0 ? opening.to : opening.from;
      const target = autoAlong(end, dir, sign * (A.switchGapM + size.w / 2));
      const hit = homeMapNearestWall(ctx.edges, target);
      if (!hit || hit.distance > 0.5) continue;
      if (hit.offset < margin || hit.offset > hit.wall.length - margin) continue;
      const candidate = wallCandidate(hit.wall, hit.offset, size);
      if (spotFree(ctx, candidate, size, height)) return candidate;
    }
  }
  return null;
};

const cornerSpot = (ctx: AutoContext, size: AutoSize, height: number): AutoCandidate | null => {
  const inset = Math.max(A.cornerInsetM, Math.max(size.w, size.d) / 2);
  const candidates = ctx.corners.map((corner) => {
    const at = autoAlong(corner.vertex, corner.bisector, inset);
    return { boundary: corner.vertex, at, rotation: autoAngleDeg(autoSub(ctx.centre, at)) };
  });
  return bestFree(ctx, candidates, size, height);
};

const evenSpot = (ctx: AutoContext, size: AutoSize, height: number): AutoCandidate | null =>
  bestFree(
    ctx,
    ctx.edges.flatMap((edge) => edgeCandidates(edge, size)),
    size,
    height,
  );

export const autoWallHeight = (
  ctx: AutoContext,
  role: HomeMapAutoRole,
  facts: HomeMapAutoFacts,
): number => {
  if (role === 'ac') {
    return Math.max(facts.defaultHeightM, ctx.ceilingHeight - A.airConditionerDropM);
  }
  if (role === 'camera') return Math.min(A.cameraHeightM, ctx.ceilingHeight - A.ceilingGapM);
  return facts.defaultHeightM;
};

const preferredWallSpot = (
  ctx: AutoContext,
  role: HomeMapAutoRole,
  size: AutoSize,
  height: number,
): AutoCandidate | null => {
  switch (role) {
    case 'camera':
      return cornerSpot(ctx, size, height);
    case 'switch':
      return switchSpot(ctx, size, height);
    case 'tv':
    case 'ac':
    case 'presence':
      return centredSpot(ctx, size, height);
    case 'generic':
    case 'corner':
      return null;
  }
};

export const autoWallPick = (
  ctx: AutoContext,
  role: HomeMapAutoRole,
  size: AutoSize,
  height: number,
): AutoCandidate | null =>
  preferredWallSpot(ctx, role, size, height) ?? evenSpot(ctx, size, height);

export const autoFloorPick = (
  ctx: AutoContext,
  role: HomeMapAutoRole,
  size: AutoSize,
): AutoCandidate | null => {
  const cells = role === 'corner' ? ctx.cellsByCorner : ctx.cellsByWall;
  for (const cell of cells) {
    const rect = { at: cell.at, w: size.w, d: size.d, rotation: 0 };
    if (!autoRectClear(ctx.polygon, ctx.edges, rect, A.floorWallClearanceM)) continue;
    if (ctx.floorUses.some((use) => autoRectsOverlap(use.rect, rect))) continue;
    return { boundary: cell.at, at: cell.at, rotation: 0 };
  }
  return null;
};

export const autoRegisterWall = (
  ctx: AutoContext,
  candidate: AutoCandidate,
  half: number,
): void => {
  ctx.wallUses.push({ boundary: candidate.boundary, half });
};

export const autoRegisterFloor = (ctx: AutoContext, rect: AutoRect, h: number): void => {
  ctx.floorUses.push({ rect, h });
};
