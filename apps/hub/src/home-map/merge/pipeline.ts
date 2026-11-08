import {
  ApiError,
  HOME_MAP_DEFAULT_CEILING_HEIGHT,
  HOME_MAP_RING,
  homeMapSceneWithinTolerance,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRingShape,
  type HomeMapRoom,
  type HomeMapSource,
  type HomeMapSourceGeometry,
} from '@smarteverything/domain';
import { z } from 'zod';
import { firstImport } from './first-import';
import { rectifyScene, type RectifySkip, type RectifyTransform } from './rectify';
import { floorMaterialOfCode, reimportRooms } from './reimport-rooms';
import { reimportStructure } from './reimport-structure';

export type FrameVerdict =
  | { readonly kind: 'keep' }
  | {
      readonly kind: 'realign';
      readonly transform: RectifyTransform;
      readonly ops: readonly HomeMapOp[];
    }
  | { readonly kind: 'refuse'; readonly ops: readonly HomeMapOp[] };

export interface FrameCheckInput {
  readonly map: HomeMap;
  readonly source: HomeMapSource;
  readonly floor: HomeMapFloor;
  readonly geometry: HomeMapSourceGeometry;
  readonly importedAt: string;
  readonly newId: () => string;
}

export type FrameCheck = (input: FrameCheckInput) => FrameVerdict;

export interface ImportInput {
  readonly map: HomeMap;
  readonly geometry: HomeMapSourceGeometry;
  readonly sourceKind: HomeMapSource['kind'];
  readonly sourceId: string;
  readonly deviceId: string;
  readonly floorId: string;
  readonly importedAt: string;
  readonly newId: () => string;
  readonly frameCheck: FrameCheck;
}

export type ImportPlan =
  | { readonly kind: 'noop' }
  | {
      readonly kind: 'first' | 'merge' | 'refused';
      readonly actor: HomeMapActor;
      readonly ops: readonly HomeMapOp[];
      readonly skipped: readonly RectifySkip[];
    };

const FIRST_FLOOR = {
  name: 'Ground floor',
  level: 0,
  elevation: 0,
  ceilingHeight: HOME_MAP_DEFAULT_CEILING_HEIGHT,
} as const;

const BASE_CARPETS = z.array(HOME_MAP_RING);

const actorOf = (sourceId: string): HomeMapActor => `source:${sourceId}`;

function planFirst(input: ImportInput): ImportPlan {
  const result = firstImport(input);
  const floorOps: HomeMapOp[] = input.map.floors.some((floor) => floor.id === input.floorId)
    ? []
    : [
        {
          op: 'addFloor',
          floor: {
            id: input.floorId,
            ...FIRST_FLOOR,
            rooms: [],
            walls: [],
            openings: [],
            objects: [],
            placements: [],
            annotations: [],
          },
        },
      ];
  const onFloor =
    (kind: 'room' | 'wall' | 'opening' | 'object' | 'placement') =>
    (element: object): HomeMapOp => ({
      op: 'add',
      kind,
      floorId: input.floorId,
      element: { ...element },
    });
  return {
    kind: 'first',
    actor: actorOf(input.sourceId),
    ops: [
      ...floorOps,
      { op: 'add', kind: 'source', element: { ...result.source } },
      ...result.rooms.map(onFloor('room')),
      ...result.walls.map(onFloor('wall')),
      ...result.openings.map(onFloor('opening')),
      ...result.objects.map(onFloor('object')),
      ...result.placements.map(onFloor('placement')),
    ],
    skipped: result.skipped,
  };
}

const sameMaterial = (a: HomeMapRoom['floorMaterial'], b: HomeMapRoom['floorMaterial']): boolean =>
  a.kind === b.kind && a.variant === b.variant && a.tint === b.tint;

function reboundRefs(roomOps: readonly HomeMapOp[]): ReadonlyMap<string, string> {
  const rebound = new Map<string, string>();
  for (const op of roomOps) {
    if (op.op !== 'update' || op.kind !== 'room') continue;
    const origin: unknown = op.patch['origin'];
    const parsed = z.looseObject({ ref: z.string() }).safeParse(origin);
    if (parsed.success) rebound.set(op.id, parsed.data.ref);
  }
  return rebound;
}

function materialOps(
  source: HomeMapSource,
  floor: HomeMapFloor,
  scene: ReturnType<typeof rectifyScene>,
  roomOps: readonly HomeMapOp[],
): readonly HomeMapOp[] {
  const rebound = reboundRefs(roomOps);
  const codes = new Map(scene.rooms.map((room) => [room.ref, room.floorCode]));
  return floor.rooms.flatMap((room): HomeMapOp[] => {
    const { origin } = room;
    if (origin.kind !== 'source' || origin.sourceId !== source.id) return [];
    if (origin.overridden.includes('floorMaterial')) return [];
    const ref = rebound.get(room.id) ?? origin.ref;
    if (!codes.has(ref)) return [];
    const floorMaterial = floorMaterialOfCode(codes.get(ref) ?? null);
    return sameMaterial(room.floorMaterial, floorMaterial)
      ? []
      : [{ op: 'update', kind: 'room', floorId: floor.id, id: room.id, patch: { floorMaterial } }];
  });
}

const carpetsOf = (source: HomeMapSource): readonly HomeMapRingShape[] => {
  const held: unknown = source.base['carpets'];
  const parsed = BASE_CARPETS.safeParse(held);
  return parsed.success ? parsed.data : [];
};

const carpetsMoved = (
  before: readonly HomeMapRingShape[],
  after: readonly HomeMapRingShape[],
): boolean =>
  !homeMapSceneWithinTolerance(
    { rooms: [], walls: [], openings: [], carpets: before },
    { rooms: [], walls: [], openings: [], carpets: after },
  );

function floorOf(map: HomeMap, source: HomeMapSource): HomeMapFloor {
  const floor = map.floors.find((candidate) => candidate.id === source.floorId);
  if (floor === undefined) {
    throw new ApiError('internal', `The map has no floor ${source.floorId} for its source.`);
  }
  return floor;
}

interface Merged {
  readonly ops: readonly HomeMapOp[];
  readonly baseChanged: boolean;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly skipped: readonly RectifySkip[];
}

function mergeScene(
  input: ImportInput,
  source: HomeMapSource,
  floor: HomeMapFloor,
  verdict: Exclude<FrameVerdict, { readonly kind: 'refuse' }>,
): Merged {
  const { map, geometry, importedAt, newId } = input;
  const transform = verdict.kind === 'realign' ? verdict.transform : source.transform;
  const scene = rectifyScene(geometry, transform);
  const rooms = reimportRooms({
    source,
    floor,
    notices: map.notices,
    scene: scene.rooms,
    importedAt,
    newId,
  });
  const structure = reimportStructure({ source, floor, scene, newId });
  const held = carpetsOf(source);
  const moved = carpetsMoved(held, scene.carpets);
  const realigned = verdict.kind === 'realign';
  return {
    ops: [
      ...(realigned ? verdict.ops : []),
      ...rooms.ops,
      ...structure.ops,
      ...materialOps(source, floor, scene, rooms.ops),
    ],
    baseChanged: realigned || rooms.baseChanged || structure.baseChanged || moved,
    patch: {
      base: {
        ...source.base,
        rooms: rooms.baseRooms,
        walls: structure.baseWalls,
        openings: structure.baseOpenings,
        carpets: moved ? scene.carpets : held,
        dock: scene.dock,
      },
      tombstones: [...structure.tombstones],
      transform: { ...transform },
      frame: geometry.frame,
      lastVersion: geometry.version,
      lastImportedAt: importedAt,
    },
    skipped: scene.skipped,
  };
}

function planMerge(input: ImportInput, source: HomeMapSource): ImportPlan {
  const { map, geometry, importedAt, newId } = input;
  const floor = floorOf(map, source);
  const verdict = input.frameCheck({ map, source, floor, geometry, importedAt, newId });
  const actor = actorOf(source.id);
  if (verdict.kind === 'refuse') {
    return verdict.ops.length === 0
      ? { kind: 'noop' }
      : { kind: 'refused', actor, ops: verdict.ops, skipped: [] };
  }
  const merged = mergeScene(input, source, floor, verdict);
  if (merged.ops.length === 0 && !merged.baseChanged) return { kind: 'noop' };
  const write: HomeMapOp = { op: 'update', kind: 'source', id: source.id, patch: merged.patch };
  return { kind: 'merge', actor, ops: [...merged.ops, write], skipped: merged.skipped };
}

export function planImport(input: ImportInput): ImportPlan {
  const source = input.map.sources.find((candidate) => candidate.id === input.sourceId);
  return source === undefined ? planFirst(input) : planMerge(input, source);
}
