import type { Dispatch } from 'react';
import {
  HOME_MAP_GRID_FINE_M,
  HOME_MAP_GRID_M,
  HOME_MAP_WALL_ANGLE_STEP_DEG,
  HOME_MAP_WALL_THICKNESS,
  homeMapDistance,
  homeMapNearestWall,
  homeMapOpeningOffsetAt,
  homeMapProjectOnSegment,
  homeMapRoomAt,
  homeMapSnapPoint,
  homeMapWallLength,
  homeMapWallPointAt,
  type HomeMapSnapResult,
  type HomeMapSegmentShape,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapRoom,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';

export type WallKind = HomeMapWall['kind'];
export type OpeningKind = HomeMapOpening['kind'];

export type WallsOpeningsPick =
  | { readonly kind: 'wall'; readonly id: string }
  | { readonly kind: 'opening'; readonly id: string };

export interface WallsOpeningsState {
  readonly draft: readonly HomeMapVec[];
  readonly thickness: number;
  readonly height: number | null;
  readonly wallKind: WallKind;
  readonly openingKind: OpeningKind;
  readonly picked: WallsOpeningsPick | null;
  readonly notice: string | null;
  readonly metresPerPx: number | null;
}

export type WallsOpeningsStyle = Partial<
  Pick<WallsOpeningsState, 'thickness' | 'height' | 'wallKind' | 'openingKind'>
>;

export type WallsOpeningsEvent =
  | { readonly type: 'point'; readonly point: HomeMapVec }
  | { readonly type: 'back' }
  | { readonly type: 'cancel' }
  | { readonly type: 'style'; readonly patch: WallsOpeningsStyle }
  | { readonly type: 'pick'; readonly picked: WallsOpeningsPick | null }
  | { readonly type: 'notice'; readonly notice: string | null }
  | { readonly type: 'scale'; readonly metresPerPx: number };

export const INITIAL_WALLS_OPENINGS: WallsOpeningsState = {
  draft: [],
  thickness: HOME_MAP_WALL_THICKNESS.interior,
  height: null,
  wallKind: 'solid',
  openingKind: 'door',
  picked: null,
  notice: null,
  metresPerPx: null,
};

export const SNAP_RADIUS_M = 0.25;
export const OPENING_REACH_M = 0.3;
const SAME_POINT_M = 0.01;
const SIDE_PROBE_M = 0.05;

export interface OpeningDefaults {
  readonly width: number;
  readonly sillHeight: number;
  readonly headHeight: number;
}

const DOOR: OpeningDefaults = { width: 0.8, sillHeight: 0, headHeight: 2 };

export const OPENING_DEFAULTS: Readonly<Record<OpeningKind, OpeningDefaults>> = {
  door: DOOR,
  double_door: { ...DOOR, width: 1.4 },
  sliding_door: { width: 1.6, sillHeight: 0, headHeight: 2.1 },
  pocket_door: DOOR,
  window: { width: 1, sillHeight: 0.9, headHeight: 2.1 },
  opening: { width: 0.9, sillHeight: 0, headHeight: 2.1 },
  garage_door: { width: 2.4, sillHeight: 0, headHeight: 2.1 },
};

export const LOCKABLE_KINDS: ReadonlySet<OpeningKind> = new Set([
  'door',
  'double_door',
  'sliding_door',
  'pocket_door',
  'garage_door',
]);

export function reduceWallsOpenings(
  state: WallsOpeningsState,
  event: WallsOpeningsEvent,
): WallsOpeningsState {
  switch (event.type) {
    case 'point':
      return { ...state, draft: [...state.draft, event.point], picked: null, notice: null };
    case 'back':
      return { ...state, draft: state.draft.slice(0, -1) };
    case 'cancel':
      return { ...state, draft: [], notice: null };
    case 'style':
      return { ...state, ...event.patch };
    case 'pick':
      return { ...state, picked: event.picked, draft: [], notice: null };
    case 'notice':
      return { ...state, notice: event.notice };
    case 'scale':
      return state.metresPerPx === event.metresPerPx
        ? state
        : { ...state, metresPerPx: event.metresPerPx };
  }
}

export interface SnapChoice {
  readonly fine: boolean;
  readonly free: boolean;
}

export function snapWall(
  point: HomeMapVec,
  floor: Pick<HomeMapFloor, 'walls'>,
  draft: readonly HomeMapVec[],
  choice: SnapChoice,
): HomeMapSnapResult {
  return homeMapSnapPoint(
    point,
    floor.walls,
    {
      radius: SNAP_RADIUS_M,
      gridM: choice.fine ? HOME_MAP_GRID_FINE_M : HOME_MAP_GRID_M,
      points: true,
      guides: true,
      anchor: draft.at(-1) ?? null,
      angleStepDeg: choice.free ? null : HOME_MAP_WALL_ANGLE_STEP_DEG,
    },
    draft,
  );
}

export function snapWallPoint(
  point: HomeMapVec,
  floor: Pick<HomeMapFloor, 'walls'>,
  draft: readonly HomeMapVec[],
  choice: SnapChoice,
): HomeMapVec {
  return snapWall(point, floor, draft, choice).point;
}

export type DraftFinish = 'last' | 'first' | null;

export function draftFinish(
  draft: readonly HomeMapVec[],
  point: HomeMapVec,
  radius: number,
): DraftFinish {
  const last = draft.at(-1);
  const first = draft[0];
  if (last !== undefined && homeMapDistance(last, point) <= radius) return 'last';
  if (draft.length > 2 && first !== undefined && homeMapDistance(first, point) <= radius) {
    return 'first';
  }
  return null;
}

export function wallOps(
  floorId: string,
  draft: readonly HomeMapVec[],
  state: Pick<WallsOpeningsState, 'thickness' | 'height' | 'wallKind'>,
  newId: () => string,
): readonly HomeMapOp[] {
  return draft.flatMap((to, index): HomeMapOp[] => {
    const from = draft[index - 1];
    if (from === undefined || homeMapDistance(from, to) < SAME_POINT_M) return [];
    const wall = {
      id: newId(),
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      thickness: state.thickness,
      height: state.height,
      kind: state.wallKind,
      origin: { kind: 'hand' },
    };
    return [{ op: 'add', kind: 'wall', floorId, element: wall }];
  });
}

export function wallUnderPoint(
  floor: Pick<HomeMapFloor, 'walls'>,
  point: HomeMapVec,
): HomeMapWall | null {
  const hit = homeMapNearestWall(floor.walls, point);
  if (hit === null) return null;
  return hit.distance <= hit.wall.thickness / 2 + OPENING_REACH_M ? hit.wall : null;
}

export function openingUnderPoint(
  floor: Pick<HomeMapFloor, 'openings'>,
  wall: HomeMapWall,
  point: HomeMapVec,
): HomeMapOpening | null {
  const along = homeMapProjectOnSegment(wall, point).offset;
  return (
    floor.openings.find(
      (opening) =>
        opening.wallId === wall.id &&
        along >= opening.offset &&
        along <= opening.offset + opening.width,
    ) ?? null
  );
}

export type OpeningTap =
  | { readonly kind: 'none' }
  | { readonly kind: 'pick'; readonly id: string }
  | { readonly kind: 'short'; readonly width: number }
  | { readonly kind: 'add'; readonly op: HomeMapOp; readonly id: string };

export function openingTap(
  floor: Pick<HomeMapFloor, 'id' | 'walls' | 'openings'>,
  point: HomeMapVec,
  kind: OpeningKind,
  newId: () => string,
): OpeningTap {
  const wall = wallUnderPoint(floor, point);
  if (wall === null) return { kind: 'none' };
  const existing = openingUnderPoint(floor, wall, point);
  if (existing !== null) return { kind: 'pick', id: existing.id };
  const shape = OPENING_DEFAULTS[kind];
  const offset = homeMapOpeningOffsetAt(wall, point, shape.width);
  if (offset === null) return { kind: 'short', width: shape.width };
  const opening = {
    id: newId(),
    wallId: wall.id,
    offset,
    kind,
    ...shape,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: null,
    lockDeviceId: null,
    origin: { kind: 'hand' },
  };
  const op: HomeMapOp = { op: 'add', kind: 'opening', floorId: floor.id, element: opening };
  return { kind: 'add', op, id: opening.id };
}

export function removeWallOps(
  floor: Pick<HomeMapFloor, 'id' | 'openings'>,
  wallId: string,
): readonly HomeMapOp[] {
  const openings = floor.openings
    .filter((opening) => opening.wallId === wallId)
    .map((opening): HomeMapOp => ({
      op: 'remove',
      kind: 'opening',
      floorId: floor.id,
      id: opening.id,
    }));
  return [...openings, { op: 'remove', kind: 'wall', floorId: floor.id, id: wallId }];
}

export function wallNormal(wall: HomeMapSegmentShape): HomeMapVec {
  const length = homeMapDistance(wall.from, wall.to);
  if (length < SAME_POINT_M) return { x: 0, y: 1 };
  return { x: -(wall.to.y - wall.from.y) / length, y: (wall.to.x - wall.from.x) / length };
}

export function pushWallOp(floorId: string, wall: HomeMapWall, offset: number): HomeMapOp | null {
  if (Math.abs(offset) < SAME_POINT_M / 10) return null;
  const normal = wallNormal(wall);
  const by = (point: HomeMapVec): HomeMapVec => ({
    x: point.x + normal.x * offset,
    y: point.y + normal.y * offset,
  });
  return {
    op: 'update',
    kind: 'wall',
    floorId,
    id: wall.id,
    patch: { from: by(wall.from), to: by(wall.to) },
  };
}

function splitAt(wall: HomeMapWall, openings: readonly HomeMapOpening[]): number {
  const length = homeMapWallLength(wall);
  const middle = length / 2;
  const across = openings.find(
    (opening) => opening.offset < middle && opening.offset + opening.width > middle,
  );
  if (across === undefined) return middle;
  const end = across.offset + across.width;
  return end < length - SAME_POINT_M ? end : across.offset;
}

function movedOpenings(
  floorId: string,
  openings: readonly HomeMapOpening[],
  split: { readonly at: number; readonly wallId: string },
): readonly HomeMapOp[] {
  return openings
    .filter((opening) => opening.offset >= split.at)
    .map((opening): HomeMapOp => ({
      op: 'update',
      kind: 'opening',
      floorId,
      id: opening.id,
      patch: { wallId: split.wallId, offset: opening.offset - split.at },
    }));
}

export function splitWallOps(
  floor: Pick<HomeMapFloor, 'id' | 'openings'>,
  wall: HomeMapWall,
  newId: () => string,
): readonly HomeMapOp[] {
  const openings = floor.openings.filter((opening) => opening.wallId === wall.id);
  const at = splitAt(wall, openings);
  if (at < SAME_POINT_M || at > homeMapWallLength(wall) - SAME_POINT_M) return [];
  const cut = homeMapWallPointAt(wall, at);
  const second = { ...wall, id: newId(), from: { x: cut.x, y: cut.y }, to: { ...wall.to } };
  return [
    { op: 'update', kind: 'wall', floorId: floor.id, id: wall.id, patch: { to: cut } },
    { op: 'add', kind: 'wall', floorId: floor.id, element: second },
    ...movedOpenings(floor.id, openings, { at, wallId: second.id }),
  ];
}

function roomBeside(
  rooms: readonly HomeMapRoom[],
  wall: HomeMapWall,
  sign: number,
): HomeMapRoom | null {
  const middle = homeMapWallPointAt(wall, homeMapWallLength(wall) / 2);
  const normal = wallNormal(wall);
  const reach = sign * (wall.thickness / 2 + SIDE_PROBE_M);
  return homeMapRoomAt(rooms, {
    x: middle.x + normal.x * reach,
    y: middle.y + normal.y * reach,
  });
}

export function roomSide(rooms: readonly HomeMapRoom[], wall: HomeMapWall): 1 | -1 {
  return roomBeside(rooms, wall, 1) === null && roomBeside(rooms, wall, -1) !== null ? -1 : 1;
}

export function wallRooms(
  rooms: readonly HomeMapRoom[],
  wall: HomeMapWall,
): readonly HomeMapRoom[] {
  const sides = [roomBeside(rooms, wall, 1), roomBeside(rooms, wall, -1)];
  return sides.filter(
    (room, index): room is HomeMapRoom => room !== null && sides.indexOf(room) === index,
  );
}

export interface PickedPart {
  readonly wall: HomeMapWall;
  readonly opening: HomeMapOpening | null;
}

export function pickedPart(
  floor: Pick<HomeMapFloor, 'walls' | 'openings'>,
  picked: WallsOpeningsPick | null,
): PickedPart | null {
  if (picked === null) return null;
  if (picked.kind === 'wall') {
    const wall = floor.walls.find((item) => item.id === picked.id);
    return wall === undefined ? null : { wall, opening: null };
  }
  const opening = floor.openings.find((item) => item.id === picked.id);
  const wall = floor.walls.find((item) => item.id === opening?.wallId);
  return opening === undefined || wall === undefined ? null : { wall, opening };
}

export type WallsOpeningsMode = 'walls' | 'openings';

export interface WallsOpeningsContext {
  readonly mode: WallsOpeningsMode;
  readonly floor: HomeMapFloor;
  readonly state: WallsOpeningsState;
  readonly dispatch: Dispatch<WallsOpeningsEvent>;
  readonly edit: (ops: readonly HomeMapOp[]) => void;
  readonly readOnly: boolean;
}
