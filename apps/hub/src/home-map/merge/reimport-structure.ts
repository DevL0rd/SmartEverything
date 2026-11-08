import {
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_SOURCE_ID,
  HOME_MAP_WALL_WRITE,
  homeMapDistance,
  homeMapOpeningOffsetAt,
  homeMapSceneWithinTolerance,
  homeMapWallPointAt,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapOrigin,
  type HomeMapSegmentShape,
  type HomeMapSource,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';
import { RECTIFY_JOIN_MAX_GAP_M, type RectifiedOpening, type RectifiedWall } from './rectify';
import {
  mergeTombstones,
  openingIsTombstoned,
  openingTombstone,
  parseTombstones,
  wallIsTombstoned,
  wallTombstone,
  type Tombstone,
} from './tombstones';

export type BaseWall = HomeMapSource['base']['walls'][number];
export type BaseOpening = HomeMapSource['base']['openings'][number];

export interface StructureScene {
  readonly walls: readonly RectifiedWall[];
  readonly openings: readonly RectifiedOpening[];
}

export interface ReimportStructureInput {
  readonly source: HomeMapSource;
  readonly floor: HomeMapFloor;
  readonly scene: StructureScene;
  readonly newId: () => string;
}

export interface ReimportStructureResult {
  readonly ops: readonly HomeMapOp[];
  readonly baseWalls: readonly BaseWall[];
  readonly baseOpenings: readonly BaseOpening[];
  readonly tombstones: readonly string[];
  readonly baseChanged: boolean;
}

interface Context extends ReimportStructureInput {
  readonly ownWalls: ReadonlyMap<string, HomeMapWall>;
  readonly ownOpenings: ReadonlyMap<string, HomeMapOpening>;
}

interface Stored {
  readonly ref: string;
  readonly id: string;
  readonly segment: HomeMapSegmentShape;
}

interface Lost<B, E> {
  readonly base: B;
  readonly element: E;
}

interface WallPlan {
  readonly adds: HomeMapOp[];
  readonly updates: HomeMapOp[];
  readonly base: BaseWall[];
  readonly stored: Map<string, Stored>;
  readonly lost: Lost<BaseWall, HomeMapWall>[];
}

interface OpeningPlan {
  readonly ops: HomeMapOp[];
  readonly base: BaseOpening[];
  readonly leaving: Set<string>;
}

interface Candidate {
  readonly centre: HomeMapVec;
  readonly target: Stored;
  readonly entry: BaseOpening;
}

const DOOR_SILL_M = 0;
const DOOR_HEAD_M = 2;

const overriddenOf = (origin: HomeMapOrigin): readonly string[] =>
  origin.kind === 'source' ? origin.overridden : [];

function ownedByRef<T extends { readonly origin: HomeMapOrigin }>(
  list: readonly T[],
  sourceId: HomeMapSource['id'],
): ReadonlyMap<string, T> {
  const owned = new Map<string, T>();
  for (const item of list) {
    if (item.origin.kind === 'source' && item.origin.sourceId === sourceId) {
      owned.set(item.origin.ref, item);
    }
  }
  return owned;
}

const isUntouched = (origin: HomeMapOrigin): boolean => overriddenOf(origin).length === 0;

function followedPatch(
  patch: Readonly<Record<string, unknown>>,
  origin: HomeMapOrigin,
): Readonly<Record<string, unknown>> | null {
  const held = overriddenOf(origin);
  const kept = Object.fromEntries(Object.entries(patch).filter(([key]) => !held.includes(key)));
  return Object.keys(kept).length === 0 ? null : kept;
}

function liveOf<B extends { readonly ref: string }, E>(
  base: readonly B[],
  owned: ReadonlyMap<string, E>,
): readonly Lost<B, E>[] {
  return base.flatMap((entry) => {
    const element = owned.get(entry.ref);
    return element === undefined ? [] : [{ base: entry, element }];
  });
}

const updateOp = (
  ctx: Context,
  kind: 'wall' | 'opening',
  id: string,
  patch: Readonly<Record<string, unknown>>,
): HomeMapOp => ({ op: 'update', kind, floorId: ctx.floor.id, id, patch });

const removeOp = (ctx: Context, kind: 'wall' | 'opening', id: string): HomeMapOp => ({
  op: 'remove',
  kind,
  floorId: ctx.floor.id,
  id,
});

function pairByCost<A, B>(
  as: readonly A[],
  bs: readonly B[],
  cost: (a: A, b: B) => number | null,
): ReadonlyMap<A, B> {
  const ranked = as
    .flatMap((a, ai) =>
      bs.flatMap((b, bi) => {
        const c = cost(a, b);
        return c === null ? [] : [{ a, b, ai, bi, c }];
      }),
    )
    .sort((p, q) => p.c - q.c || p.ai - q.ai || p.bi - q.bi);
  const pairs = new Map<A, B>();
  const taken = new Set<B>();
  for (const { a, b } of ranked) {
    if (pairs.has(a) || taken.has(b)) continue;
    pairs.set(a, b);
    taken.add(b);
  }
  return pairs;
}

function wallCost(a: HomeMapSegmentShape, b: HomeMapSegmentShape): number | null {
  const straight = Math.max(homeMapDistance(a.from, b.from), homeMapDistance(a.to, b.to));
  const crossed = Math.max(homeMapDistance(a.from, b.to), homeMapDistance(a.to, b.from));
  const cost = Math.min(straight, crossed);
  return cost <= RECTIFY_JOIN_MAX_GAP_M ? cost : null;
}

const baseWallOf = (wall: RectifiedWall, ref: string): BaseWall => ({
  ref,
  from: { x: wall.from.x, y: wall.from.y },
  to: { x: wall.to.x, y: wall.to.y },
  thickness: wall.thickness,
  kind: wall.kind,
});

const wallWithin = (base: BaseWall, next: RectifiedWall): boolean =>
  homeMapSceneWithinTolerance(
    { rooms: [], walls: [base], openings: [] },
    { rooms: [], walls: [baseWallOf(next, base.ref)], openings: [] },
  );

const openingWithin = (base: BaseOpening, entry: BaseOpening): boolean =>
  homeMapSceneWithinTolerance(
    { rooms: [], walls: [], openings: [base] },
    { rooms: [], walls: [], openings: [{ ...entry, ref: base.ref }] },
  );

const sourceOrigin = (ctx: Context, ref: string): HomeMapWall['origin'] => ({
  kind: 'source',
  sourceId: HOME_MAP_SOURCE_ID.parse(ctx.source.id),
  ref,
  overridden: [],
});

const freshRef = (preferred: string, used: Set<string>, id: string): string => {
  const ref = used.has(preferred) ? id : preferred;
  used.add(ref);
  return ref;
};

function addedWall(ctx: Context, wall: RectifiedWall, used: Set<string>): [HomeMapOp, Stored] {
  const id = ctx.newId();
  const ref = freshRef(wall.ref, used, id);
  const element = HOME_MAP_WALL_WRITE.parse({
    id,
    from: wall.from,
    to: wall.to,
    thickness: wall.thickness,
    height: null,
    kind: wall.kind,
    origin: sourceOrigin(ctx, ref),
  });
  return [
    { op: 'add', kind: 'wall', floorId: ctx.floor.id, element },
    { ref, id, segment: wall },
  ];
}

function planWalls(ctx: Context, stones: readonly Tombstone[]): WallPlan {
  const live = liveOf(ctx.source.base.walls, ctx.ownWalls);
  const free = ctx.scene.walls;
  const pairs = pairByCost(live, free, (l, w) => wallCost(l.base, w));
  const plan: WallPlan = { adds: [], updates: [], base: [], stored: new Map(), lost: [] };
  for (const entry of live) {
    const next = pairs.get(entry);
    if (next === undefined) {
      plan.lost.push(entry);
      continue;
    }
    const same = wallWithin(entry.base, next);
    const kept = same ? entry.base : baseWallOf(next, entry.base.ref);
    plan.base.push(kept);
    plan.stored.set(next.ref, { ref: kept.ref, id: entry.element.id, segment: kept });
    const patch = same
      ? null
      : followedPatch(
          { from: next.from, to: next.to, thickness: next.thickness, kind: next.kind },
          entry.element.origin,
        );
    if (patch !== null) {
      plan.updates.push(updateOp(ctx, 'wall', entry.element.id, patch));
    }
  }
  const matched = new Set(pairs.values());
  const used = new Set(ctx.source.base.walls.map((base) => base.ref));
  const fresh = free.filter((wall) => !matched.has(wall) && !wallIsTombstoned(stones, wall));
  for (const wall of fresh) {
    const [op, stored] = addedWall(ctx, wall, used);
    plan.adds.push(op);
    plan.stored.set(wall.ref, stored);
    plan.base.push(baseWallOf(wall, stored.ref));
  }
  return plan;
}

function candidatesOf(
  ctx: Context,
  stored: ReadonlyMap<string, Stored>,
): readonly (Candidate & { readonly scene: RectifiedOpening })[] {
  const sceneWalls = new Map(ctx.scene.walls.map((wall) => [wall.ref, wall]));
  return ctx.scene.openings.flatMap((scene) => {
    const wall = sceneWalls.get(scene.wallRef);
    const target = stored.get(scene.wallRef);
    if (wall === undefined || target === undefined) return [];
    const centre = homeMapWallPointAt(wall, scene.offset + scene.width / 2);
    const offset = homeMapOpeningOffsetAt(target.segment, centre, scene.width);
    if (offset === null) return [];
    const entry = {
      ref: scene.ref,
      wallRef: target.ref,
      offset,
      width: scene.width,
      kind: scene.kind,
    };
    return [{ scene, centre, target, entry }];
  });
}

function baseCentre(ctx: Context, base: BaseOpening): HomeMapVec | null {
  const wall = ctx.source.base.walls.find((candidate) => candidate.ref === base.wallRef);
  return wall === undefined ? null : homeMapWallPointAt(wall, base.offset + base.width / 2);
}

function deletions(ctx: Context): readonly string[] {
  const walls = ctx.source.base.walls
    .filter((base) => !ctx.ownWalls.has(base.ref))
    .map(wallTombstone);
  const openings = ctx.source.base.openings.flatMap((base) => {
    const centre = baseCentre(ctx, base);
    return ctx.ownOpenings.has(base.ref) || centre === null
      ? []
      : [openingTombstone(centre, base.width, base.kind)];
  });
  return [...walls, ...openings];
}

function addedOpening(
  ctx: Context,
  candidate: Candidate & { readonly scene: RectifiedOpening },
  used: Set<string>,
): [HomeMapOp, BaseOpening] {
  const id = ctx.newId();
  const ref = freshRef(candidate.scene.ref, used, id);
  const element = HOME_MAP_OPENING_WRITE.parse({
    id,
    wallId: candidate.target.id,
    offset: candidate.entry.offset,
    width: candidate.entry.width,
    kind: candidate.entry.kind,
    sillHeight: DOOR_SILL_M,
    headHeight: DOOR_HEAD_M,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    origin: sourceOrigin(ctx, ref),
  });
  return [
    { op: 'add', kind: 'opening', floorId: ctx.floor.id, element },
    { ...candidate.entry, ref },
  ];
}

function followOpening(
  ctx: Context,
  plan: OpeningPlan,
  entry: Lost<BaseOpening, HomeMapOpening>,
  next: Candidate,
): void {
  const same = openingWithin(entry.base, next.entry);
  plan.base.push(same ? entry.base : { ...next.entry, ref: entry.base.ref });
  const patch = same
    ? null
    : followedPatch(
        {
          wallId: next.target.id,
          offset: next.entry.offset,
          width: next.entry.width,
          kind: next.entry.kind,
        },
        entry.element.origin,
      );
  if (patch === null) return;
  if ('wallId' in patch && next.target.id !== entry.element.wallId) {
    plan.leaving.add(entry.element.id);
  }
  plan.ops.push(updateOp(ctx, 'opening', entry.element.id, patch));
}

function planOpenings(
  ctx: Context,
  stones: readonly Tombstone[],
  stored: ReadonlyMap<string, Stored>,
): OpeningPlan {
  const live = liveOf(ctx.source.base.openings, ctx.ownOpenings);
  const free = candidatesOf(ctx, stored);
  const pairs = pairByCost(live, free, (l, c) => {
    const centre = baseCentre(ctx, l.base);
    const gap = centre === null ? Infinity : homeMapDistance(centre, c.centre);
    return gap <= Math.min(l.base.width, c.entry.width) / 2 ? gap : null;
  });
  const plan: OpeningPlan = { ops: [], base: [], leaving: new Set() };
  for (const entry of live) {
    const next = pairs.get(entry);
    if (next === undefined) {
      if (!isUntouched(entry.element.origin)) continue;
      plan.leaving.add(entry.element.id);
      plan.ops.push(removeOp(ctx, 'opening', entry.element.id));
      continue;
    }
    followOpening(ctx, plan, entry, next);
  }
  const matched = new Set(pairs.values());
  const used = new Set(ctx.source.base.openings.map((base) => base.ref));
  const fresh = free.filter(
    (item) => !matched.has(item) && !openingIsTombstoned(stones, item.centre, item.entry.width),
  );
  for (const candidate of fresh) {
    const [op, base] = addedOpening(ctx, candidate, used);
    plan.ops.push(op);
    plan.base.push(base);
  }
  return plan;
}

function wallRemovals(
  ctx: Context,
  lost: readonly Lost<BaseWall, HomeMapWall>[],
  leaving: ReadonlySet<string>,
): readonly HomeMapOp[] {
  return lost.flatMap(({ element }): HomeMapOp[] => {
    const free = isUntouched(element.origin);
    const stays = ctx.floor.openings.some(
      (opening) => opening.wallId === element.id && !leaving.has(opening.id),
    );
    return free && !stays ? [removeOp(ctx, 'wall', element.id)] : [];
  });
}

const sameList = <T>(before: readonly T[], after: readonly T[]): boolean =>
  before.length === after.length && after.every((entry) => before.includes(entry));

export function reimportStructure(input: ReimportStructureInput): ReimportStructureResult {
  const { source, floor } = input;
  const ctx: Context = {
    ...input,
    ownWalls: ownedByRef(floor.walls, source.id),
    ownOpenings: ownedByRef(floor.openings, source.id),
  };
  const tombstones = mergeTombstones(source.tombstones, deletions(ctx));
  const stones = parseTombstones(tombstones);
  const walls = planWalls(ctx, stones);
  const openings = planOpenings(ctx, stones, walls.stored);
  return {
    ops: [
      ...walls.adds,
      ...walls.updates,
      ...openings.ops,
      ...wallRemovals(ctx, walls.lost, openings.leaving),
    ],
    baseWalls: walls.base,
    baseOpenings: openings.base,
    tombstones,
    baseChanged:
      !sameList(source.base.walls, walls.base) ||
      !sameList(source.base.openings, openings.base) ||
      tombstones !== source.tombstones,
  };
}
