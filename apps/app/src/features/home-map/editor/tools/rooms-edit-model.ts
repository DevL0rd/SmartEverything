import {
  HOME_MAP_ROOM_WRITE,
  HOME_MAP_WALL_ANGLE_STEP_DEG,
  homeMapRingArea,
  homeMapSnapPoint,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { roomLinkOp, type HubRoom } from '../list-editor/rooms-walls-model';
import {
  cleanRing,
  labelPoint,
  nextColourSlot,
  validRing,
  type DrawRing,
} from './rooms-draw-geometry';
import { reshapeRoomOp, type DrawFloor } from './rooms-draw-model';
import {
  insertCorner,
  mergeRings,
  pushedSide,
  resizedPoints,
  ringBox,
  splitRing,
  touching,
  withCorner,
  withoutCorner,
  type SizeAxis,
} from './rooms-edit-geometry';

export interface CutLine {
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
}

export type RoomsEditMode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'split'; readonly roomId: string; readonly line: CutLine | null }
  | { readonly kind: 'merge'; readonly roomId: string };

export const IDLE_EDIT: RoomsEditMode = { kind: 'idle' };

export type RoomsEditRefusal = 'holes' | 'no_cut' | 'not_touching' | 'missing';

export const REFUSAL_TEXT: Readonly<Record<RoomsEditRefusal, string>> = {
  holes: 'This room has an opening inside it, so it cannot be split or merged here.',
  no_cut: 'Draw the line right across the room, from one wall to another.',
  not_touching: 'These rooms do not share a wall, so they cannot be joined.',
  missing: 'That room is no longer on this floor.',
};

export type EditFloor = Pick<DrawFloor, 'id' | 'rooms'>;

export interface CutSnap {
  readonly radiusM: number;
  readonly gridM: number;
}

export function snapCut(
  floor: DrawFloor,
  at: HomeMapVec,
  anchor: HomeMapVec | null,
  snap: CutSnap,
): HomeMapVec {
  const corners = floor.rooms.flatMap((room) => room.polygon.outer);
  return homeMapSnapPoint(
    at,
    floor.walls,
    {
      radius: snap.radiusM,
      gridM: snap.gridM,
      points: true,
      guides: false,
      anchor,
      angleStepDeg: anchor === null ? null : HOME_MAP_WALL_ANGLE_STEP_DEG,
    },
    corners,
  ).point;
}

export type EditStep =
  | { readonly kind: 'ops'; readonly ops: readonly HomeMapOp[]; readonly select: string }
  | { readonly kind: 'refused'; readonly reason: RoomsEditRefusal };

const refused = (reason: RoomsEditRefusal): EditStep => ({ kind: 'refused', reason });

function roomOf(floor: EditFloor, id: string): HomeMapRoom | null {
  return floor.rooms.find((room) => room.id === id) ?? null;
}

function pieceOp(floor: EditFloor, source: HomeMapRoom, ring: DrawRing, id: string): HomeMapOp {
  const element = HOME_MAP_ROOM_WRITE.parse({
    id,
    name: null,
    homeRoomId: null,
    polygon: { outer: ring, holes: [] },
    labelAt: labelPoint(ring),
    colourSlot: nextColourSlot(floor.rooms),
    floorMaterial: source.floorMaterial,
    wallPaint: source.wallPaint,
    ceilingHeight: source.ceilingHeight,
    origin: { kind: 'hand' },
  });
  return { op: 'add', kind: 'room', floorId: floor.id, element };
}

export function splitRoom(
  floor: EditFloor,
  roomId: string,
  line: CutLine,
  newId: () => string,
): EditStep {
  const room = roomOf(floor, roomId);
  if (room === null) return refused('missing');
  if (room.polygon.holes.length > 0) return refused('holes');
  const pieces = splitRing(room.polygon.outer, line.from, line.to);
  if (pieces === null) return refused('no_cut');
  const [first, second] = pieces;
  const [kept, cut] =
    homeMapRingArea(first) >= homeMapRingArea(second) ? [first, second] : [second, first];
  const id = newId();
  return {
    kind: 'ops',
    ops: [reshapeRoomOp(floor.id, room.id, kept), pieceOp(floor, room, cut, id)],
    select: id,
  };
}

function survivor(keep: HomeMapRoom, other: HomeMapRoom): Readonly<Record<string, unknown>> {
  if (keep.homeRoomId !== null || keep.name !== null) return {};
  if (keep.origin.kind !== 'hand') return {};
  return other.homeRoomId === null ? { name: other.name } : { homeRoomId: other.homeRoomId };
}

export function mergeRooms(floor: EditFloor, keepId: string, otherId: string): EditStep {
  const keep = roomOf(floor, keepId);
  const other = roomOf(floor, otherId);
  if (keep === null || other === null || keep.id === other.id) return refused('missing');
  if (keep.polygon.holes.length > 0 || other.polygon.holes.length > 0) return refused('holes');
  const ring = mergeRings(keep.polygon.outer, other.polygon.outer);
  if (ring === null) return refused('not_touching');
  return {
    kind: 'ops',
    ops: [
      { op: 'remove', kind: 'room', floorId: floor.id, id: other.id },
      {
        op: 'update',
        kind: 'room',
        floorId: floor.id,
        id: keep.id,
        patch: {
          polygon: { outer: ring, holes: [] },
          labelAt: labelPoint(ring),
          ...survivor(keep, other),
        },
      },
    ],
    select: keep.id,
  };
}

export function mergeCandidates(floor: EditFloor, roomId: string): readonly HomeMapRoom[] {
  const room = roomOf(floor, roomId);
  if (room === null || room.polygon.holes.length > 0) return [];
  return floor.rooms.filter(
    (other) =>
      other.id !== room.id &&
      other.polygon.holes.length === 0 &&
      touching(room.polygon.outer, other.polygon.outer),
  );
}

export type LinkAction =
  | { readonly kind: 'op'; readonly op: HomeMapOp }
  | {
      readonly kind: 'vacuum';
      readonly deviceId: string;
      readonly mapRoomId: string;
      readonly roomId: string | null;
    }
  | { readonly kind: 'none' }
  | { readonly kind: 'no_robot' };

export function linkAction(
  map: { readonly sources: readonly { readonly id: string; readonly deviceId: string }[] },
  floorId: string,
  room: HomeMapRoom,
  homeRoomId: string | null,
): LinkAction {
  if (room.homeRoomId === homeRoomId) return { kind: 'none' };
  if (room.origin.kind === 'hand') {
    const op = roomLinkOp(floorId, room, homeRoomId);
    return op === null ? { kind: 'none' } : { kind: 'op', op };
  }
  const { sourceId, ref } = room.origin;
  const source = map.sources.find((item) => item.id === sourceId);
  if (source === undefined) return { kind: 'no_robot' };
  return { kind: 'vacuum', deviceId: source.deviceId, mapRoomId: ref, roomId: homeRoomId };
}

export function linkChoices<R extends HubRoom>(
  floor: EditFloor,
  room: HomeMapRoom,
  hubRooms: readonly R[],
): readonly R[] {
  const taken = new Set(
    floor.rooms.flatMap((other) =>
      other.id !== room.id && other.homeRoomId !== null ? [other.homeRoomId] : [],
    ),
  );
  return hubRooms.filter((hub) => !taken.has(hub.id)).sort((a, b) => compareText(a.name, b.name));
}

export function namesItself(room: HomeMapRoom): boolean {
  return room.origin.kind === 'hand' && room.homeRoomId === null;
}

export interface ShapeEdit {
  readonly op: HomeMapOp;
  readonly corner: number | null;
}

function reshaped(floorId: string, room: HomeMapRoom, ring: DrawRing | null): HomeMapOp | null {
  if (ring === null) return null;
  const clean = cleanRing(ring);
  if (clean.length !== ring.length || !validRing(clean)) return null;
  return reshapeRoomOp(floorId, room.id, clean, room.polygon.holes);
}

export function moveCornerOp(
  floorId: string,
  room: HomeMapRoom,
  index: number,
  point: HomeMapVec,
): HomeMapOp | null {
  return reshaped(floorId, room, withCorner(room.polygon.outer, index, point));
}

export function pushSideOp(
  floorId: string,
  room: HomeMapRoom,
  side: number,
  offset: number,
): HomeMapOp | null {
  return reshaped(floorId, room, pushedSide(room.polygon.outer, side, offset));
}

export function addCorner(floorId: string, room: HomeMapRoom, side: number): ShapeEdit | null {
  const op = reshaped(floorId, room, insertCorner(room.polygon.outer, side));
  return op === null ? null : { op, corner: side + 1 };
}

export function removeCornerOp(
  floorId: string,
  room: HomeMapRoom,
  index: number,
): HomeMapOp | null {
  return reshaped(floorId, room, withoutCorner(room.polygon.outer, index));
}

export function resizeRoomOp(
  floorId: string,
  room: HomeMapRoom,
  axis: SizeAxis,
  size: number,
): HomeMapOp | null {
  if (!(size > 0)) return null;
  const box = ringBox(room.polygon.outer);
  const ring = resizedPoints(room.polygon.outer, box, axis, size);
  const holes = room.polygon.holes.map((hole) => resizedPoints(hole, box, axis, size));
  if (!validRing(ring)) return null;
  return reshapeRoomOp(floorId, room.id, ring, holes);
}

export function moveRoomOp(floorId: string, roomId: string, by: HomeMapVec): HomeMapOp {
  return { op: 'move', kind: 'room', floorId, id: roomId, dx: by.x, dy: by.y };
}
