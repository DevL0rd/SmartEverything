import {
  HOME_MAP_NOTICE_WRITE,
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_SOURCE_ID,
  homeMapPolygonArea,
  homeMapRobotFloor,
  homeMapSceneWithinTolerance,
  type HomeMapFloor,
  type HomeMapNotice,
  type HomeMapOp,
  type HomeMapPolygonShape,
  type HomeMapRoom,
  type HomeMapSource,
  type HomeMapVec,
} from '@smarteverything/domain';
import { HOME_MAP_UNSET_FLOOR } from './first-import';
import {
  matchRooms,
  polygonBoundariesWithin,
  type MatchNew,
  type MatchOld,
  type RoomMatching,
} from './match';
import type { RectifiedRoom } from './rectify';

export const SHAPE_AREA_FRACTION = 0.1;
export const SHAPE_HAUSDORFF_M = 0.3;

const COLOUR_SLOTS = 8;

export interface BaseRoom {
  readonly ref: string;
  readonly polygon: HomeMapPolygonShape;
  readonly labelAt: HomeMapVec;
  readonly floorCode: number | null;
}

export interface ReimportRoomsInput {
  readonly source: HomeMapSource;
  readonly floor: HomeMapFloor;
  readonly notices: readonly HomeMapNotice[];
  readonly scene: readonly RectifiedRoom[];
  readonly importedAt: string;
  readonly newId: () => string;
}

export interface ReimportRoomsResult {
  readonly ops: readonly HomeMapOp[];
  readonly baseRooms: readonly BaseRoom[];
  readonly baseChanged: boolean;
}

interface OwnRoom {
  readonly room: HomeMapRoom;
  readonly ref: string;
  readonly overridden: readonly string[];
}

interface NoticeWish {
  readonly kind: HomeMapNotice['kind'];
  readonly elementId: string;
  readonly detail: string;
}

interface Change {
  readonly rebind: boolean;
  readonly moved: boolean;
  readonly keptPolygon: boolean;
  readonly raised: boolean;
}

interface Settled {
  readonly update: HomeMapOp | null;
  readonly wish: NoticeWish | null;
  readonly entry: BaseRoom;
  readonly followed: boolean;
}

export function floorMaterialOfCode(code: number | null): HomeMapRoom['floorMaterial'] {
  const floor = code === null ? null : homeMapRobotFloor(code);
  return floor?.status === 'known'
    ? { kind: floor.kind, variant: floor.variant, tint: null }
    : { ...HOME_MAP_UNSET_FLOOR };
}

const toBase = (room: RectifiedRoom): BaseRoom => ({
  ref: room.ref,
  polygon: room.polygon,
  labelAt: room.labelAt,
  floorCode: room.floorCode,
});

const baseOf = (entry: HomeMapSource['base']['rooms'][number]): BaseRoom => {
  const code: unknown = entry['floorCode'];
  return {
    ref: entry.ref,
    polygon: entry.polygon,
    labelAt: entry.labelAt,
    floorCode: typeof code === 'number' ? code : null,
  };
};

const withinTolerance = (a: BaseRoom, b: BaseRoom): boolean =>
  homeMapSceneWithinTolerance(
    { rooms: [a], walls: [], openings: [] },
    { rooms: [b], walls: [], openings: [] },
  );

export function shapeDiffers(reference: HomeMapPolygonShape, next: HomeMapPolygonShape): boolean {
  const before = homeMapPolygonArea(reference);
  const after = homeMapPolygonArea(next);
  if (before <= 0 || Math.abs(after - before) > SHAPE_AREA_FRACTION * before) return true;
  return !polygonBoundariesWithin(next, reference, SHAPE_HAUSDORFF_M);
}

function ownRooms(floor: HomeMapFloor, source: HomeMapSource): readonly OwnRoom[] {
  return floor.rooms.flatMap((room) =>
    room.origin.kind === 'source' && room.origin.sourceId === source.id
      ? [{ room, ref: room.origin.ref, overridden: room.origin.overridden }]
      : [],
  );
}

const labelOf = (room: HomeMapRoom): string => room.name ?? 'A room';

function changeOf(own: OwnRoom, scene: RectifiedRoom, old: BaseRoom | undefined): Change {
  const moved = old === undefined || !withinTolerance(old, toBase(scene));
  const keptPolygon = own.overridden.includes('polygon');
  const reference = old?.polygon ?? own.room.polygon;
  return {
    rebind: own.ref !== scene.ref,
    moved,
    keptPolygon,
    raised: moved && keptPolygon && shapeDiffers(reference, scene.polygon),
  };
}

function patchOf(
  own: OwnRoom,
  scene: RectifiedRoom,
  change: Change,
): Readonly<Record<string, unknown>> | null {
  const follows = change.moved && !change.keptPolygon;
  const patch = {
    ...(change.rebind ? { origin: { ...own.room.origin, ref: scene.ref } } : {}),
    ...(follows ? { polygon: scene.polygon } : {}),
    ...(follows && !own.overridden.includes('labelAt') ? { labelAt: scene.labelAt } : {}),
  };
  return Object.keys(patch).length > 0 ? patch : null;
}

function entryOf(scene: RectifiedRoom, old: BaseRoom | undefined, change: Change): BaseRoom {
  if (old === undefined || change.rebind) return toBase(scene);
  if (change.moved && (!change.keptPolygon || change.raised)) return toBase(scene);
  return old.floorCode === scene.floorCode ? old : { ...old, floorCode: scene.floorCode };
}

function followRobot(
  floorId: string,
  own: OwnRoom,
  scene: RectifiedRoom,
  old: BaseRoom | undefined,
): Settled {
  const change = changeOf(own, scene, old);
  const patch = patchOf(own, scene, change);
  return {
    update: patch === null ? null : { op: 'update', kind: 'room', floorId, id: own.room.id, patch },
    wish: change.raised
      ? {
          kind: 'source_changed',
          elementId: own.room.id,
          detail: `The robot's shape of ${labelOf(own.room)} changed. Use the robot's shape or keep yours.`,
        }
      : null,
    entry: entryOf(scene, old, change),
    followed: true,
  };
}

function missingWish(own: OwnRoom): NoticeWish {
  return {
    kind: 'source_missing',
    elementId: own.room.id,
    detail: `${labelOf(own.room)} is no longer in the robot's map. Delete it or keep it as a hand room.`,
  };
}

function splitWish(own: OwnRoom, parts: number): NoticeWish {
  return {
    kind: 'source_changed',
    elementId: own.room.id,
    detail: `The robot split ${labelOf(own.room)} into ${String(parts)} rooms. Split like the robot or keep it as it is.`,
  };
}

function newRoomOf(input: ReimportRoomsInput, scene: RectifiedRoom, slot: number): HomeMapRoom {
  return HOME_MAP_ROOM_WRITE.parse({
    id: input.newId(),
    name: scene.name,
    homeRoomId: null,
    polygon: scene.polygon,
    labelAt: scene.labelAt,
    colourSlot: (slot % COLOUR_SLOTS) + 1,
    floorMaterial: floorMaterialOfCode(scene.floorCode),
    wallPaint: null,
    ceilingHeight: null,
    origin: {
      kind: 'source',
      sourceId: HOME_MAP_SOURCE_ID.parse(input.source.id),
      ref: scene.ref,
      overridden: [],
    },
  });
}

function noticeOps(
  input: ReimportRoomsInput,
  wishes: readonly NoticeWish[],
  matchedIds: ReadonlySet<string>,
): readonly HomeMapOp[] {
  const resolved = input.notices
    .filter((n) => n.kind === 'source_missing' && matchedIds.has(n.elementId))
    .map((n): HomeMapOp => ({ op: 'remove', kind: 'notice', id: n.id }));
  const raised = wishes.flatMap((wish): HomeMapOp[] => {
    const held = input.notices.find((n) => n.kind === wish.kind && n.elementId === wish.elementId);
    if (held === undefined) {
      const element = HOME_MAP_NOTICE_WRITE.parse({
        id: input.newId(),
        ...wish,
        createdAt: input.importedAt,
      });
      return [{ op: 'add', kind: 'notice', element }];
    }
    return held.detail === wish.detail
      ? []
      : [{ op: 'update', kind: 'notice', id: held.id, patch: { detail: wish.detail } }];
  });
  return [...resolved, ...raised];
}

function matchingOf(
  owns: readonly OwnRoom[],
  baseByRef: ReadonlyMap<string, BaseRoom>,
  scene: readonly RectifiedRoom[],
): RoomMatching {
  const olds: MatchOld[] = owns.map((own) => ({
    id: own.room.id,
    ref: own.ref,
    polygon: baseByRef.get(own.ref)?.polygon ?? own.room.polygon,
  }));
  const news: MatchNew[] = scene.map((room) => ({ ref: room.ref, polygon: room.polygon }));
  return matchRooms(olds, news);
}

interface Counterpart {
  readonly robot: RectifiedRoom | undefined;
  readonly splitParts: number | undefined;
  readonly old: BaseRoom | undefined;
}

function settleOne(floorId: string, own: OwnRoom, found: Counterpart): Settled {
  if (found.robot !== undefined) return followRobot(floorId, own, found.robot, found.old);
  const { room } = own;
  return {
    update: null,
    wish: found.splitParts === undefined ? missingWish(own) : splitWish(own, found.splitParts),
    entry: found.old ?? {
      ref: own.ref,
      polygon: room.polygon,
      labelAt: room.labelAt,
      floorCode: null,
    },
    followed: false,
  };
}

function addOps(
  input: ReimportRoomsInput,
  refs: readonly string[],
  sceneByRef: ReadonlyMap<string, RectifiedRoom>,
): readonly HomeMapOp[] {
  return refs.flatMap((ref, index): HomeMapOp[] => {
    const robot = sceneByRef.get(ref);
    if (robot === undefined) return [];
    const element = newRoomOf(input, robot, input.floor.rooms.length + index);
    return [{ op: 'add', kind: 'room', floorId: input.floor.id, element }];
  });
}

function nextBaseOf(
  scene: readonly RectifiedRoom[],
  followed: ReadonlyMap<string, BaseRoom>,
  baseByRef: ReadonlyMap<string, BaseRoom>,
): readonly BaseRoom[] {
  return scene.map((room) => {
    const kept = followed.get(room.ref);
    if (kept !== undefined) return kept;
    const old = baseByRef.get(room.ref);
    return old !== undefined && withinTolerance(old, toBase(room)) ? old : toBase(room);
  });
}

export function reimportRooms(input: ReimportRoomsInput): ReimportRoomsResult {
  const { source, floor, scene } = input;
  const owns = ownRooms(floor, source);
  const oldBase = source.base.rooms.map(baseOf);
  const baseByRef = new Map(oldBase.map((entry) => [entry.ref, entry]));
  const sceneByRef = new Map(scene.map((room) => [room.ref, room]));
  const matching = matchingOf(owns, baseByRef, scene);
  const settled = owns.map((own) => {
    const ref = matching.bound.get(own.room.id);
    const robot = ref === undefined ? undefined : sceneByRef.get(ref);
    const splitParts = matching.splits.get(own.room.id)?.length;
    return settleOne(floor.id, own, { robot, splitParts, old: baseByRef.get(own.ref) });
  });
  const followed = new Map(settled.filter((s) => s.followed).map((s) => [s.entry.ref, s.entry]));
  const adds = matching.unmatchedNew.filter((ref) => !baseByRef.has(ref));
  const sceneBase = nextBaseOf(scene, followed, baseByRef);
  const baseRooms = [...sceneBase, ...settled.filter((s) => !s.followed).map((s) => s.entry)];
  const oldSet = new Set(oldBase);
  const wishes = settled.flatMap((s) => s.wish ?? []);
  return {
    ops: [
      ...settled.flatMap((s) => s.update ?? []),
      ...addOps(input, adds, sceneByRef),
      ...noticeOps(input, wishes, new Set(matching.bound.keys())),
    ],
    baseRooms,
    baseChanged:
      baseRooms.length !== oldBase.length || baseRooms.some((entry) => !oldSet.has(entry)),
  };
}
