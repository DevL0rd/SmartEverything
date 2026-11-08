import {
  FAMILY_PLACEMENT,
  MOUNT_HEIGHT_M,
  deviceFamily,
  homeMapMountOnWall,
  homeMapRoomAt,
  placementFacts,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapVec,
  type ModelRef,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { updateDevice } from '../../../../api/devices';
import {
  NO_EDIT_OVERLAY,
  type EditEvent,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { HIT_RADIUS_PX } from '../../../../components/house-map/edit/radii';
import type { Device } from '../../../../store/state';
import type { HomeMapSaveStatus } from '../../data/edits';
import type { HomeMapEditing } from '../../data/home-map-query';
import type { EditorNotice } from '../mount-edit';
import type { MoveEdit } from '../tool-state';
import { placeAutomatically } from '../list-editor/objects-devices-model';

const log = new Logger('app.home-map');

export const MOVE_FAILED_TEXT = 'The room did not change. The device stays where it was.';
export const NOT_SAVED_TEXT = 'The map did not save that change. Try again.';

export interface HubRoomName {
  readonly id: string;
  readonly name: string;
}

export interface RoomMove {
  readonly deviceId: string;
  readonly name: string;
  readonly from: string | null;
  readonly fromName: string | null;
  readonly to: string;
  readonly toName: string;
  readonly ops: readonly HomeMapOp[];
  readonly undo: readonly HomeMapOp[];
  readonly fresh: boolean;
  readonly at: HomeMapVec;
}

export function placementOfDevice(map: HomeMap, deviceId: string): HomeMapPlacement | null {
  for (const floor of map.floors) {
    const found = floor.placements.find((entry) => entry.deviceId === deviceId);
    if (found !== undefined) return found;
  }
  return null;
}

export function droppedPlacement(
  floor: HomeMapFloor,
  deviceId: string,
  base: HomeMapPlacement | null,
  at: HomeMapVec,
): HomeMapPlacement {
  const fresh: HomeMapPlacement = {
    deviceId,
    floorId: floor.id,
    at: { x: at.x, y: at.y },
    rotation: 0,
    height: 0,
    tilt: 0,
    mount: 'floor',
    auto: false,
    camera: null,
  };
  const start = base ?? fresh;
  const { wall: _old, ...rest } = start;
  const plain: HomeMapPlacement = {
    ...rest,
    floorId: floor.id,
    at: { x: at.x, y: at.y },
    auto: false,
  };
  const onWall = plain.mount === 'wall' ? homeMapMountOnWall(floor.walls, floor.rooms, at) : null;
  if (onWall === null) return plain;
  const spot = { x: onWall.at.x, y: onWall.at.y };
  return { ...plain, at: spot, rotation: onWall.rotation, wall: onWall.attachment };
}

export function remountedPlacement(
  floor: HomeMapFloor,
  device: Device,
  placement: HomeMapPlacement,
  mount: HomeMapPlacement['mount'],
): HomeMapPlacement {
  const facts = FAMILY_PLACEMENT[deviceFamily(device)];
  const room = homeMapRoomAt(floor.rooms, placement.at);
  const height =
    mount === 'ceiling'
      ? (room?.ceilingHeight ?? floor.ceilingHeight)
      : facts.mount === mount
        ? facts.defaultHeightM
        : MOUNT_HEIGHT_M[mount];
  return droppedPlacement(floor, device.id, { ...placement, mount, height }, placement.at);
}

export function placementOps(
  base: HomeMapPlacement | null,
  next: HomeMapPlacement | null,
): readonly HomeMapOp[] {
  const remove: readonly HomeMapOp[] =
    base === null
      ? []
      : [{ op: 'remove', kind: 'placement', floorId: base.floorId, id: base.deviceId }];
  const add: readonly HomeMapOp[] =
    next === null ? [] : [{ op: 'add', kind: 'placement', floorId: next.floorId, element: next }];
  return [...remove, ...add];
}

function roomName(rooms: readonly HubRoomName[], id: string | null): string | null {
  return rooms.find((room) => room.id === id)?.name ?? null;
}

export function roomMoveOf(
  floor: HomeMapFloor,
  device: Pick<Device, 'id' | 'label' | 'room_id'>,
  at: HomeMapVec,
  rooms: readonly HubRoomName[],
): Pick<RoomMove, 'deviceId' | 'name' | 'from' | 'fromName' | 'to' | 'toName'> | null {
  const target = homeMapRoomAt(floor.rooms, at)?.homeRoomId ?? null;
  if (target === null || target === device.room_id) return null;
  const fromName = roomName(rooms, device.room_id);
  const toName = roomName(rooms, target) ?? 'that room';
  return {
    deviceId: device.id,
    name: device.label,
    from: device.room_id,
    fromName,
    to: target,
    toName,
  };
}

export function chosenHomeRoom(
  floor: HomeMapFloor | null,
  devices: readonly Pick<Device, 'id' | 'room_id'>[],
  selected: string | null,
): string | null {
  const room = floor?.rooms.find((each) => each.id === selected);
  if (room !== undefined) return room.homeRoomId;
  return devices.find((device) => device.id === selected)?.room_id ?? null;
}

export function hitPlacement(
  floor: Pick<HomeMapFloor, 'placements'>,
  at: HomeMapVec,
  radius: number,
): string | null {
  let best: { readonly id: string; readonly distance: number } | null = null;
  for (const placement of floor.placements) {
    const distance = Math.hypot(placement.at.x - at.x, placement.at.y - at.y);
    if (distance <= radius && (best === null || distance < best.distance)) {
      best = { id: placement.deviceId, distance };
    }
  }
  return best?.id ?? null;
}

export interface DevicesInput {
  readonly map: HomeMap;
  readonly floorId: string | null;
  readonly editing: HomeMapEditing;
  readonly readOnly: boolean;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}

export interface Flow {
  readonly pending: RoomMove | null;
  readonly moved: RoomMove | null;
  readonly note: string | null;
}

export const CALM: Flow = { pending: null, moved: null, note: null };

export const noted = (note: string | null): Flow => ({ ...CALM, note });

export function savedNote(job: Promise<HomeMapSaveStatus>): Promise<Flow> {
  return job.then((status) => noted(status.kind === 'saved' ? null : NOT_SAVED_TEXT));
}

export async function moveRoom(
  editing: Pick<HomeMapEditing, 'edit'>,
  move: RoomMove,
): Promise<Flow> {
  const status = await editing.edit(move.ops);
  if (status.kind !== 'saved') return noted(NOT_SAVED_TEXT);
  try {
    await updateDevice(move.deviceId, { room_id: move.to });
    log.info('home_map.device_room_moved', { deviceId: move.deviceId });
    return { ...CALM, moved: move };
  } catch (cause) {
    log.warn('home_map.device_room_move_failed', { deviceId: move.deviceId, cause: String(cause) });
    await editing.edit(move.undo);
    return noted(MOVE_FAILED_TEXT);
  }
}

export async function undoRoom(
  editing: Pick<HomeMapEditing, 'edit'>,
  move: RoomMove,
): Promise<Flow> {
  try {
    await updateDevice(move.deviceId, { room_id: move.from });
  } catch (cause) {
    log.warn('home_map.device_room_undo_failed', { deviceId: move.deviceId, cause: String(cause) });
    return { ...CALM, moved: move, note: MOVE_FAILED_TEXT };
  }
  return savedNote(editing.edit(move.undo));
}

export async function keepRoom(map: HomeMap, move: RoomMove): Promise<Flow> {
  if (!move.fresh || move.from === null) return CALM;
  return noted(await placeAutomatically(map, [move.deviceId]));
}

export async function placeAll(map: HomeMap, deviceIds: readonly string[]): Promise<Flow> {
  return noted(await placeAutomatically(map, deviceIds));
}

export type DeviceMount = HomeMapPlacement['mount'];

export interface ArmedDevice {
  readonly deviceId: string;
  readonly name: string;
  readonly mount: DeviceMount;
  readonly height: number;
}

export const ARMED_TAGS: Readonly<Record<DeviceMount, string>> = {
  floor: 'Tap the floor',
  table: 'Tap a table',
  wall: 'Tap a wall',
  ceiling: 'Tap under the ceiling spot',
};

export function armedOf(
  device: Device,
  placement: HomeMapPlacement | null,
  main: ModelRef | null,
): ArmedDevice {
  const base = { deviceId: device.id, name: device.label };
  if (placement !== null) return { ...base, mount: placement.mount, height: placement.height };
  const known = main?.kind === 'catalogue' ? placementFacts(main.modelId) : undefined;
  const facts = known ?? FAMILY_PLACEMENT[deviceFamily(device)];
  return { ...base, mount: facts.mount, height: facts.defaultHeightM };
}

export function armedNotice(armed: ArmedDevice | null): EditorNotice | null {
  if (armed === null) return null;
  return { text: `${ARMED_TAGS[armed.mount]} to place ${armed.name}.`, tone: 'info' };
}

export type PlaceEdit = Extract<EditEvent, { readonly type: 'place' }>;

export type TapEdit = Extract<EditEvent, { readonly type: 'tap' }>;

function withWall(
  placement: Omit<HomeMapPlacement, 'wall'>,
  wall: HomeMapPlacement['wall'],
): HomeMapPlacement {
  return wall === undefined ? placement : { ...placement, wall };
}

export function spotPlacement(
  floor: HomeMapFloor,
  armed: ArmedDevice,
  base: HomeMapPlacement | null,
  event: PlaceEdit,
): HomeMapPlacement {
  const { wall: _old, ...start } = base ?? droppedPlacement(floor, armed.deviceId, null, event.at);
  const placed = {
    ...start,
    floorId: floor.id,
    at: { x: event.at.x, y: event.at.y },
    rotation: event.wall === null ? start.rotation : event.rotation,
    height: event.height,
    mount: armed.mount,
    auto: false,
  };
  return withWall(placed, event.wall ?? undefined);
}

export function movedPlacement(base: HomeMapPlacement, event: MoveEdit): HomeMapPlacement {
  const { wall: old, ...start } = base;
  const mount = event.mount ?? base.mount;
  const placed = {
    ...start,
    at: { x: event.at.x, y: event.at.y },
    rotation: event.rotation,
    height: event.height ?? base.height,
    mount,
    auto: false,
  };
  return withWall(placed, event.wall ?? (mount === 'wall' ? old : undefined));
}

export type Settled =
  | { readonly kind: 'apply'; readonly ops: readonly HomeMapOp[] }
  | { readonly kind: 'ask'; readonly move: RoomMove };

export interface SettleInput {
  readonly floor: HomeMapFloor;
  readonly device: Pick<Device, 'id' | 'label' | 'room_id'> | undefined;
  readonly base: HomeMapPlacement | null;
  readonly next: HomeMapPlacement;
  readonly rooms: readonly HubRoomName[];
}

export function settledPlacement({ floor, device, base, next, rooms }: SettleInput): Settled {
  const ops = placementOps(base, next);
  const change = device === undefined ? null : roomMoveOf(floor, device, next.at, rooms);
  if (change === null) return { kind: 'apply', ops };
  const undo = placementOps(next, base);
  return { kind: 'ask', move: { ...change, ops, undo, fresh: base === null, at: next.at } };
}

export function tappedId(floor: HomeMapFloor, event: TapEdit): string | null {
  if (event.hit.kind === 'device') return event.hit.id;
  return (
    hitPlacement(floor, event.point, HIT_RADIUS_PX * event.metresPerPx) ??
    homeMapRoomAt(floor.rooms, event.point)?.id ??
    null
  );
}

type EditGizmo = NonNullable<EditOverlay['gizmo']>;

const GIZMO_AXES: Readonly<Record<DeviceMount, EditGizmo['axes']>> = {
  floor: ['x', 'y'],
  table: ['x', 'y'],
  wall: ['y', 'z'],
  ceiling: ['x', 'y', 'z'],
};

export function deviceGizmo(placement: HomeMapPlacement): EditGizmo {
  return {
    mode: 'move',
    space: 'local',
    centre: { x: placement.at.x, y: placement.at.y, height: placement.height },
    axes: GIZMO_AXES[placement.mount],
    turn: placement.rotation,
  };
}

export interface OverlayState {
  readonly floor: HomeMapFloor | null;
  readonly armed: ArmedDevice | null;
  readonly selected: string | null;
  readonly readOnly: boolean;
}

export function devicesOverlay({ floor, armed, selected, readOnly }: OverlayState): EditOverlay {
  if (armed !== null && !readOnly) {
    const place = { kind: 'device', mount: armed.mount, height: armed.height } as const;
    return { ...NO_EDIT_OVERLAY, mode: 'place', place, readOnly };
  }
  const placement = floor?.placements.find((each) => each.deviceId === selected);
  return {
    ...NO_EDIT_OVERLAY,
    mode: 'select',
    selection: selected === null ? [] : [selected],
    gizmo: placement === undefined ? null : deviceGizmo(placement),
    readOnly,
  };
}
