import {
  API_ENDPOINTS as E,
  HOME_MAP_MOUNTS,
  homeMapRoomAt,
  type HomeMap,
  type HomeMapFloor,
  type HomeMapObject,
  type HomeMapOp,
  type HomeMapPlacement,
  type HomeMapRoom,
  type HomeMapVec,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { compareText } from '../../../../format/text';
import type { Device } from '../../../../store/state';

const log = new Logger('app.home-map');

export const DUPLICATE_OFFSET_M = 0.3;
export const OUTSIDE_TEXT = 'Outside every room';
export const NOTHING_PLACED_TEXT = 'Nothing was placed: the room has no free spot for it.';
export const PLACE_FAILED_TEXT = 'Placing did not finish: check the map and try again.';
export const NOT_ON_MAP_TEXT = 'Its room is not on the map yet: link a map room to it first.';

export const MOUNT_LABELS: Readonly<Record<HomeMapPlacement['mount'], string>> = {
  floor: 'Floor',
  wall: 'Wall',
  ceiling: 'Ceiling',
  table: 'Table',
};

export const MOUNT_OPTIONS = HOME_MAP_MOUNTS.map((value) => ({
  value,
  label: MOUNT_LABELS[value],
}));

export interface TitledRoom {
  readonly room: HomeMapRoom;
  readonly title: string;
}

export interface ItemsContext {
  readonly floor: HomeMapFloor;
  readonly rooms: readonly TitledRoom[];
  readonly readOnly: boolean;
  readonly apply: (ops: readonly HomeMapOp[]) => void;
  readonly place: (deviceIds: readonly string[]) => void;
}

export function words(text: string): string {
  const spaced = text.replace(/[._-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function objectTitle(
  object: Pick<HomeMapObject, 'label' | 'modelId'>,
  catalogueTitle?: string,
): string {
  if (object.label !== null && object.label.trim() !== '') return object.label;
  return catalogueTitle ?? words(object.modelId.replace(/^cat\./, ''));
}

export function roomIdAt(floor: Pick<HomeMapFloor, 'rooms'>, at: HomeMapVec): string | null {
  return homeMapRoomAt(floor.rooms, at)?.id ?? null;
}

export function roomNameAt(context: Pick<ItemsContext, 'floor' | 'rooms'>, at: HomeMapVec): string {
  const id = roomIdAt(context.floor, at);
  return context.rooms.find(({ room }) => room.id === id)?.title ?? OUTSIDE_TEXT;
}

export function placementOp(
  floorId: string,
  deviceId: string,
  patch: Partial<HomeMapPlacement>,
): HomeMapOp {
  return {
    op: 'update',
    kind: 'placement',
    floorId,
    id: deviceId,
    patch: { ...patch, auto: false },
  };
}

export function manualPlaceOp(
  floorId: HomeMapFloor['id'],
  deviceId: string,
  at: HomeMapVec,
): HomeMapOp {
  const element: HomeMapPlacement = {
    deviceId,
    floorId,
    at: { x: at.x, y: at.y },
    rotation: 0,
    height: 0,
    tilt: 0,
    mount: 'floor',
    auto: false,
    camera: null,
  };
  return { op: 'add', kind: 'placement', floorId, element };
}

export function duplicateOp(floorId: string, object: HomeMapObject, id: string): HomeMapOp {
  const at = { x: object.at.x + DUPLICATE_OFFSET_M, y: object.at.y + DUPLICATE_OFFSET_M };
  const element = { ...object, id, at, locked: false, origin: { kind: 'hand' } };
  return { op: 'add', kind: 'object', floorId, element };
}

export function footprintRing(
  object: Pick<HomeMapObject, 'params' | 'rotation'>,
): readonly HomeMapVec[] {
  const halfW = (object.params['width'] ?? 1) / 2;
  const halfD = (object.params['depth'] ?? 1) / 2;
  const turn = (object.rotation * Math.PI) / 180;
  const corners = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ] as const;
  return corners.map(([x, y]) => ({
    x: x * Math.cos(turn) - y * Math.sin(turn),
    y: x * Math.sin(turn) + y * Math.cos(turn),
  }));
}

export interface PlacedDevice {
  readonly device: Device;
  readonly placement: HomeMapPlacement;
}

export interface UnplacedDevice {
  readonly device: Device;
  readonly onMap: boolean;
}

export interface DeviceGroups {
  readonly placed: readonly PlacedDevice[];
  readonly unplaced: readonly UnplacedDevice[];
}

export function deviceGroups(
  map: HomeMap,
  floor: HomeMapFloor,
  devices: readonly Device[],
): DeviceGroups {
  const sorted = [...devices].sort((a, b) => compareText(a.label, b.label));
  const placedAnywhere = new Set(
    map.floors.flatMap((each) => each.placements.map((placement) => placement.deviceId)),
  );
  const linked = new Set(
    map.floors.flatMap((each) => each.rooms.flatMap((room) => room.homeRoomId ?? [])),
  );
  return {
    placed: sorted.flatMap((device) => {
      const placement = floor.placements.find((each) => each.deviceId === device.id);
      return placement === undefined ? [] : [{ device, placement }];
    }),
    unplaced: sorted
      .filter((device) => !placedAnywhere.has(device.id))
      .map((device) => ({ device, onMap: device.room_id !== null && linked.has(device.room_id) })),
  };
}

export async function placeAutomatically(
  map: Pick<HomeMap, 'id'>,
  deviceIds: readonly string[],
): Promise<string | null> {
  try {
    const answer = await api().call(E.placeHomeMapDevices, {
      query: { mapId: map.id },
      body: { deviceIds: [...deviceIds] },
    });
    log.info('home_map.list_placed', { asked: deviceIds.length, placed: answer.placed });
    return answer.placed === 0 ? NOTHING_PLACED_TEXT : null;
  } catch (cause) {
    log.warn('home_map.list_place_failed', { asked: deviceIds.length, cause: String(cause) });
    return PLACE_FAILED_TEXT;
  }
}
