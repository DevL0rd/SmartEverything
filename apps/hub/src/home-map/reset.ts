import {
  ApiError,
  HOME_MAP_WALL_WRITE,
  homeMapSceneWithinTolerance,
  type HomeMap,
  type HomeMapActor,
  type HomeMapEditResultAnswer,
  type HomeMapFloor,
  type HomeMapId,
  type HomeMapNotice,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapOrigin,
  type HomeMapRoom,
  type HomeMapSource,
  type HomeMapSourceGeometry,
  type HomeMapWall,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { rectifyScene } from './merge/rectify';
import { reimportStructure, type StructureScene } from './merge/reimport-structure';
import type { HomeMapService } from './service';

export interface ResetPorts {
  readonly maps: Pick<HomeMapService, 'get' | 'apply'>;
  readonly geometryOf: (source: HomeMapSource) => HomeMapSourceGeometry | null;
  readonly newId: () => string;
  readonly log: Logger;
}

export interface ResetPlanInput {
  readonly map: HomeMap;
  readonly sourceId?: string | undefined;
  readonly sceneOf: (source: HomeMapSource) => StructureScene;
  readonly newId: () => string;
}

type BaseWall = HomeMapSource['base']['walls'][number];
type BaseOpening = HomeMapSource['base']['openings'][number];

const overriddenOf = (origin: HomeMapOrigin): readonly string[] =>
  origin.kind === 'source' ? origin.overridden : [];

const cleared = (origin: HomeMapOrigin, drop?: string): HomeMapOrigin =>
  origin.kind === 'source'
    ? {
        ...origin,
        overridden: drop === undefined ? [] : origin.overridden.filter((key) => key !== drop),
      }
    : origin;

function ownedByRef<T extends { readonly origin: HomeMapOrigin }>(
  list: readonly T[],
  sourceId: string,
): ReadonlyMap<string, T> {
  const owned = new Map<string, T>();
  for (const item of list) {
    if (item.origin.kind === 'source' && item.origin.sourceId === sourceId) {
      owned.set(item.origin.ref, item);
    }
  }
  return owned;
}

const wallShape = (ref: string, wall: BaseWall | HomeMapWall): BaseWall => ({
  ref,
  from: wall.from,
  to: wall.to,
  thickness: wall.thickness,
  kind: wall.kind,
});

function wallReset(floorId: string, held: HomeMapWall, base: BaseWall): HomeMapOp | null {
  const open = overriddenOf(held.origin);
  const same = homeMapSceneWithinTolerance(
    { rooms: [], walls: [wallShape(base.ref, held)], openings: [] },
    { rooms: [], walls: [base], openings: [] },
  );
  if (same && open.length === 0) return null;
  const patch = {
    from: base.from,
    to: base.to,
    thickness: base.thickness,
    kind: base.kind,
    ...(open.includes('height') ? { height: null } : {}),
    origin: cleared(held.origin),
  };
  return { op: 'update', kind: 'wall', floorId, id: held.id, patch };
}

function openingReset(
  floorId: string,
  held: HomeMapOpening,
  base: BaseOpening,
  wallId: string,
): HomeMapOp | null {
  const open = overriddenOf(held.origin);
  const wallRef = held.wallId === wallId ? base.wallRef : '';
  const same = homeMapSceneWithinTolerance(
    {
      rooms: [],
      walls: [],
      openings: [
        { ref: base.ref, wallRef, offset: held.offset, width: held.width, kind: held.kind },
      ],
    },
    { rooms: [], walls: [], openings: [base] },
  );
  if (same && open.length === 0) return null;
  const patch = {
    wallId,
    offset: base.offset,
    width: base.width,
    kind: base.kind,
    origin: cleared(held.origin),
  };
  return { op: 'update', kind: 'opening', floorId, id: held.id, patch };
}

interface Structure {
  readonly wallAdds: readonly HomeMapOp[];
  readonly wallResets: readonly HomeMapOp[];
  readonly wallUpdates: readonly HomeMapOp[];
  readonly openingOps: readonly HomeMapOp[];
  readonly openingResets: readonly HomeMapOp[];
  readonly wallRemovals: readonly HomeMapOp[];
  readonly baseWalls: readonly BaseWall[];
  readonly baseOpenings: readonly BaseOpening[];
}

const keyOf = (op: HomeMapOp): string => ('id' in op && 'kind' in op ? `${op.kind}:${op.id}` : '');

const coveredKeys = (ops: readonly HomeMapOp[]): ReadonlySet<string> => new Set(ops.map(keyOf));

function addedWallIds(ops: readonly HomeMapOp[]): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const op of ops) {
    if (op.op !== 'add' || op.kind !== 'wall') continue;
    const wall = HOME_MAP_WALL_WRITE.parse(op.element);
    if (wall.origin.kind === 'source') ids.set(wall.origin.ref, wall.id);
  }
  return ids;
}

function structureOf(
  source: HomeMapSource,
  floor: HomeMapFloor,
  scene: StructureScene,
  newId: () => string,
): Structure {
  const walls = ownedByRef(floor.walls, source.id);
  const openings = ownedByRef(floor.openings, source.id);
  const view: HomeMapSource = {
    ...source,
    tombstones: [],
    base: {
      ...source.base,
      walls: source.base.walls.filter((base) => walls.has(base.ref)),
      openings: source.base.openings.filter((base) => openings.has(base.ref)),
    },
  };
  const found = reimportStructure({ source: view, floor, scene, newId });
  const wallIds = new Map([
    ...[...walls].map(([ref, wall]): [string, string] => [ref, wall.id]),
    ...addedWallIds(found.ops),
  ]);
  const wallResets = found.baseWalls.flatMap((base) => {
    const held = walls.get(base.ref);
    return held === undefined ? [] : (wallReset(floor.id, held, base) ?? []);
  });
  const openingResets = found.baseOpenings.flatMap((base) => {
    const held = openings.get(base.ref);
    const wallId = wallIds.get(base.wallRef);
    if (held === undefined || wallId === undefined) return [];
    return openingReset(floor.id, held, base, wallId) ?? [];
  });
  const forced = coveredKeys([...wallResets, ...openingResets]);
  const rest = found.ops.filter((op) => op.op !== 'update' || !forced.has(keyOf(op)));
  const isWall = (op: HomeMapOp): boolean => 'kind' in op && op.kind === 'wall';
  return {
    wallAdds: rest.filter((op) => isWall(op) && op.op === 'add'),
    wallResets,
    wallUpdates: rest.filter((op) => isWall(op) && op.op === 'update'),
    openingOps: rest.filter((op) => 'kind' in op && op.kind === 'opening'),
    openingResets,
    wallRemovals: rest.filter((op) => isWall(op) && op.op === 'remove'),
    baseWalls: found.baseWalls,
    baseOpenings: found.baseOpenings,
  };
}

function roomReset(
  floorId: string,
  room: HomeMapRoom,
  base: HomeMapSource['base']['rooms'][number],
): HomeMapOp {
  const labelHeld = overriddenOf(room.origin).includes('labelAt');
  const patch = {
    polygon: base.polygon,
    ...(labelHeld ? {} : { labelAt: base.labelAt }),
    origin: cleared(room.origin, 'polygon'),
  };
  return { op: 'update', kind: 'room', floorId, id: room.id, patch };
}

interface RoomResult {
  readonly ops: readonly HomeMapOp[];
  readonly reset: ReadonlySet<string>;
}

function roomOps(source: HomeMapSource, floor: HomeMapFloor): RoomResult {
  const bases = new Map(source.base.rooms.map((base) => [base.ref, base]));
  const ops: HomeMapOp[] = [];
  const reset = new Set<string>();
  for (const [ref, room] of ownedByRef(floor.rooms, source.id)) {
    const base = bases.get(ref);
    if (base === undefined || !overriddenOf(room.origin).includes('polygon')) continue;
    ops.push(roomReset(floor.id, room, base));
    reset.add(room.id);
  }
  return { ops, reset };
}

const dismissals = (notices: readonly HomeMapNotice[], rooms: ReadonlySet<string>): HomeMapOp[] =>
  notices
    .filter((notice) => notice.kind === 'source_changed' && rooms.has(notice.elementId))
    .map((notice): HomeMapOp => ({ op: 'remove', kind: 'notice', id: notice.id }));

const sameBase = (source: HomeMapSource, structure: Structure): boolean =>
  JSON.stringify([source.base.walls, source.base.openings]) ===
  JSON.stringify([structure.baseWalls, structure.baseOpenings]);

function sourceWrite(source: HomeMapSource, structure: Structure): readonly HomeMapOp[] {
  if (sameBase(source, structure) && source.tombstones.length === 0) return [];
  const base = { ...source.base, walls: structure.baseWalls, openings: structure.baseOpenings };
  return [{ op: 'update', kind: 'source', id: source.id, patch: { base, tombstones: [] } }];
}

function sourceOps(
  map: HomeMap,
  source: HomeMapSource,
  scene: StructureScene,
  newId: () => string,
): HomeMapOp[] {
  const floor = map.floors.find((candidate) => candidate.id === source.floorId);
  if (floor === undefined) return [];
  const structure = structureOf(source, floor, scene, newId);
  const rooms = roomOps(source, floor);
  return [
    ...structure.wallAdds,
    ...structure.wallResets,
    ...structure.wallUpdates,
    ...structure.openingOps,
    ...structure.openingResets,
    ...structure.wallRemovals,
    ...rooms.ops,
    ...dismissals(map.notices, rooms.reset),
    ...sourceWrite(source, structure),
  ];
}

export function planReset(input: ResetPlanInput): readonly HomeMapOp[] {
  const { map, sourceId, sceneOf, newId } = input;
  const chosen =
    sourceId === undefined ? map.sources : map.sources.filter((source) => source.id === sourceId);
  if (sourceId !== undefined && chosen.length === 0) {
    throw new ApiError('not_found', `The map has no robot source ${sourceId}.`);
  }
  return chosen.flatMap((source) => sourceOps(map, source, sceneOf(source), newId));
}

export class HomeMapReset {
  constructor(private readonly ports: ResetPorts) {}

  reset(mapId: HomeMapId, actor: HomeMapActor, sourceId?: string): HomeMapEditResultAnswer {
    const map = this.ports.maps.get(mapId);
    const ops = planReset({
      map,
      sourceId,
      sceneOf: (source) => this.sceneOf(source),
      newId: this.ports.newId,
    });
    if (ops.length === 0) return { revision: map.revision, conflicts: [] };
    const applied = this.ports.maps.apply(ops, actor, {}, mapId);
    this.ports.log.info('home_map.reset_to_source', {
      mapId,
      sourceId: sourceId ?? null,
      ops: applied.applied.length,
      conflicts: applied.conflicts.length,
    });
    return { revision: applied.revision, conflicts: [...applied.conflicts] };
  }

  private sceneOf(source: HomeMapSource): StructureScene {
    const geometry = this.ports.geometryOf(source);
    if (geometry === null) {
      throw new ApiError('conflict', 'The robot has no published map to reset to yet.');
    }
    return rectifyScene(geometry, source.transform);
  }
}
