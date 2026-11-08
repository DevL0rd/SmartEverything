import {
  applyHomeMapEdits,
  homeMapDistance,
  type HomeMap,
  type HomeMapActor,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapRoom,
  type HomeMapVec,
  type HomeMapWall,
} from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { cleanRing, rectRing, validRing, type DrawRing } from '../tools/rooms-draw-geometry';
import { addRoomOp, reshapeRoomOp } from '../tools/rooms-draw-model';

export interface RoomRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly length: number;
}

export const NEW_ROOM_M = { width: 4, length: 3, gap: 0.5 } as const;
export const NEW_WALL_M = 3;
export const NOT_APPLIED_TEXT = 'That value does not fit the map, so nothing changed.';

const SAME_M = 0.0001;

function edgeAxisAligned(a: HomeMapVec, b: HomeMapVec): boolean {
  return Math.abs(a.x - b.x) < SAME_M || Math.abs(a.y - b.y) < SAME_M;
}

export function roomRect(ring: DrawRing): RoomRect | null {
  if (ring.length !== 4) return null;
  const aligned = ring.every((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return next !== undefined && edgeAxisAligned(point, next);
  });
  if (!aligned) return null;
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, length: Math.max(...ys) - y };
}

function reshaped(floorId: string, room: HomeMapRoom, ring: DrawRing): HomeMapOp | null {
  const clean = cleanRing(ring);
  if (!validRing(clean)) return null;
  return reshapeRoomOp(floorId, room.id, clean);
}

export function roomRectOp(floorId: string, room: HomeMapRoom, rect: RoomRect): HomeMapOp | null {
  const from = { x: rect.x, y: rect.y };
  return reshaped(
    floorId,
    room,
    rectRing(from, { x: rect.x + rect.width, y: rect.y + rect.length }),
  );
}

export function cornerOp(
  floorId: string,
  room: HomeMapRoom,
  index: number,
  point: HomeMapVec,
): HomeMapOp | null {
  const ring = room.polygon.outer.map((corner, at) =>
    at === index ? { x: point.x, y: point.y } : { x: corner.x, y: corner.y },
  );
  return reshaped(floorId, room, ring);
}

export function addCornerOp(floorId: string, room: HomeMapRoom, index: number): HomeMapOp | null {
  const ring = room.polygon.outer;
  const from = ring[index];
  const to = ring[(index + 1) % ring.length];
  if (from === undefined || to === undefined) return null;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const next = [...ring.slice(0, index + 1), middle, ...ring.slice(index + 1)];
  return reshapeRoomOp(floorId, room.id, next);
}

export function removeCornerOp(
  floorId: string,
  room: HomeMapRoom,
  index: number,
): HomeMapOp | null {
  const ring = room.polygon.outer.filter((_, at) => at !== index);
  return ring.length < 3 ? null : reshaped(floorId, room, ring);
}

interface Extent {
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function floorExtent(floor: Pick<HomeMapFloor, 'rooms' | 'walls'>): Extent | null {
  const points = [
    ...floor.rooms.flatMap((room) => room.polygon.outer),
    ...floor.walls.flatMap((wall) => [wall.from, wall.to]),
  ];
  if (points.length === 0) return null;
  return {
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

export interface NewElement {
  readonly op: HomeMapOp;
  readonly id: string;
}

export function newRoom(
  floor: Pick<HomeMapFloor, 'id' | 'rooms' | 'walls'>,
  newId: () => string,
): NewElement {
  const extent = floorExtent(floor);
  const x = extent === null ? 0 : extent.right + NEW_ROOM_M.gap;
  const y = extent?.top ?? 0;
  const ring = rectRing({ x, y }, { x: x + NEW_ROOM_M.width, y: y + NEW_ROOM_M.length });
  const id = newId();
  return { op: addRoomOp({ floor, newId }, ring, id), id };
}

export function newWall(
  floor: Pick<HomeMapFloor, 'id' | 'rooms' | 'walls'>,
  thickness: number,
  newId: () => string,
): NewElement {
  const extent = floorExtent(floor);
  const y = extent === null ? 0 : extent.bottom + NEW_ROOM_M.gap;
  const id = newId();
  const element = {
    id,
    from: { x: 0, y },
    to: { x: NEW_WALL_M, y },
    thickness,
    height: null,
    kind: 'solid',
    origin: { kind: 'hand' },
  };
  return { op: { op: 'add', kind: 'wall', floorId: floor.id, element }, id };
}

export function roomUpdate(
  floorId: string,
  roomId: string,
  patch: Readonly<Record<string, unknown>>,
): HomeMapOp {
  return { op: 'update', kind: 'room', floorId, id: roomId, patch: { ...patch } };
}

export function roomNameOp(floorId: string, room: HomeMapRoom, name: string): HomeMapOp | null {
  const trimmed = name.trim();
  const next = trimmed === '' ? null : trimmed;
  return next === room.name ? null : roomUpdate(floorId, room.id, { name: next });
}

export function roomLinkOp(
  floorId: string,
  room: HomeMapRoom,
  homeRoomId: string | null,
): HomeMapOp | null {
  return room.homeRoomId === homeRoomId ? null : roomUpdate(floorId, room.id, { homeRoomId });
}

export interface HubRoom {
  readonly id: string;
  readonly name: string;
}

export function linkableRooms<R extends HubRoom>(
  floor: Pick<HomeMapFloor, 'rooms'>,
  roomId: string,
  hubRooms: readonly R[],
): readonly R[] {
  const taken = new Set(
    floor.rooms.flatMap((room) =>
      room.id !== roomId && room.homeRoomId !== null ? [room.homeRoomId] : [],
    ),
  );
  return hubRooms.filter((hub) => !taken.has(hub.id)).sort((a, b) => compareText(a.name, b.name));
}

export const UNLINKED_TEXT = 'Not linked to a home room';

export function linkedHubRoom<R extends HubRoom>(
  room: Pick<HomeMapRoom, 'homeRoomId'>,
  hubRooms: readonly R[],
): R | null {
  return hubRooms.find((hub) => hub.id === room.homeRoomId) ?? null;
}

export function roomTitle(
  room: Pick<HomeMapRoom, 'name' | 'homeRoomId'>,
  hubRooms: readonly HubRoom[],
  index: number,
): string {
  return linkedHubRoom(room, hubRooms)?.name ?? room.name ?? `Room ${String(index + 1)}`;
}

export function roomLinkNote(
  room: Pick<HomeMapRoom, 'homeRoomId'>,
  hubRooms: readonly HubRoom[],
): string | null {
  return linkedHubRoom(room, hubRooms) === null ? UNLINKED_TEXT : null;
}

export function wallUpdate(
  floorId: string,
  wallId: string,
  patch: Readonly<Record<string, unknown>>,
): HomeMapOp {
  return { op: 'update', kind: 'wall', floorId, id: wallId, patch: { ...patch } };
}

export type WallEnd = 'from' | 'to';

export function wallEndOp(
  floorId: string,
  wall: HomeMapWall,
  end: WallEnd,
  point: HomeMapVec,
): HomeMapOp | null {
  const other = end === 'from' ? wall.to : wall.from;
  if (homeMapDistance(other, point) < SAME_M) return null;
  return wallUpdate(floorId, wall.id, { [end]: { x: point.x, y: point.y } });
}

export function wallLengthOp(floorId: string, wall: HomeMapWall, length: number): HomeMapOp | null {
  if (length <= 0) return null;
  const current = homeMapDistance(wall.from, wall.to);
  const ux = current < SAME_M ? 1 : (wall.to.x - wall.from.x) / current;
  const uy = current < SAME_M ? 0 : (wall.to.y - wall.from.y) / current;
  const to = { x: wall.from.x + ux * length, y: wall.from.y + uy * length };
  return wallEndOp(floorId, wall, 'to', to);
}

export function checkedOps(
  map: HomeMap,
  ops: readonly HomeMapOp[],
  actor: HomeMapActor,
): readonly HomeMapOp[] | null {
  if (ops.length === 0) return null;
  const result = applyHomeMapEdits(map, ops, { actor, at: new Date().toISOString() });
  return result.conflicts.length === 0 ? ops : null;
}

export interface ListEditContext {
  readonly floor: HomeMapFloor;
  readonly readOnly: boolean;
  readonly apply: (ops: readonly HomeMapOp[]) => void;
  readonly notify: (notice: string) => void;
}

export function applyOne(context: ListEditContext, op: HomeMapOp | null): void {
  if (op === null) {
    context.notify(NOT_APPLIED_TEXT);
    return;
  }
  context.apply([op]);
}
