import { isDirectoryChild } from '../../../plugins/device-contributions';
import {
  deviceFamily,
  roomLightsTarget,
  roomNameOf,
  type DeviceTarget,
  type TableRow,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import { roomGroupsOf, type RoomGroup } from '../../../store/room-groups';
import { orderedRooms } from '../../../store/table-rules';
import type { Device } from '../../../store/state';
import { isOffline } from '../../devices';
import { FAMILY_GROUPS } from './families';
import { splitRoomLights } from './room-lights';
import { compareText } from '../../../format/text';

export const ANY = 'any';
export const NO_ROOM = 'none';
export interface DeviceQuery {
  readonly text: string;
  readonly room: string;
  readonly kind: string;
  readonly offline: boolean;
}

export interface LightsCard {
  readonly devices: readonly Device[];
  readonly target: DeviceTarget;
}

export interface DeviceSection {
  readonly key: string;
  readonly title: string;
  readonly count: number;
  readonly lights: LightsCard | null;
  readonly devices: readonly Device[];
}

export function isFiltering(query: DeviceQuery): boolean {
  return query.text.trim() !== '' || query.kind !== ANY || query.offline;
}

type Rooms = readonly TableRow<'rooms'>[];

function kindOf(device: Device): string {
  return FAMILY_GROUPS[deviceFamily(device)].one;
}

function roomMatches(device: Device, room: string, rooms: Rooms): boolean {
  if (room === ANY) {
    return true;
  }
  if (room === NO_ROOM) {
    return roomNameOf(device, rooms) === null;
  }
  return device.room_id === room;
}

function kindMatches(device: Device, kind: string): boolean {
  return kind === ANY || kindOf(device) === kind;
}

function textMatches(device: Device, needle: string, rooms: Rooms): boolean {
  return (
    needle === '' ||
    [device.label, device.model, roomNameOf(device, rooms) ?? '', kindOf(device)].some((text) =>
      text.toLowerCase().includes(needle),
    )
  );
}

function ordered(devices: readonly Device[]): readonly Device[] {
  return [...devices].sort(
    (left, right) =>
      Number(right.favourite) - Number(left.favourite) ||
      left.position - right.position ||
      compareText(left.label, right.label),
  );
}

function lightsTargetOf(key: string, lights: readonly Device[]): DeviceTarget {
  return key === NO_ROOM
    ? { kind: 'devices', deviceIds: lights.map((device) => device.id) }
    : roomLightsTarget(key);
}

function sectionOf(group: RoomGroup<Device>, nested: boolean): DeviceSection {
  const split = nested ? splitRoomLights(group.devices) : null;
  return {
    key: group.key,
    title: group.title,
    count: group.devices.length,
    lights:
      split === null
        ? null
        : { devices: split.lights, target: lightsTargetOf(group.key, split.lights) },
    devices: split === null ? group.devices : split.rest,
  };
}

export function groupedDevices(
  devices: readonly Device[],
  rooms: Rooms,
  query: DeviceQuery,
): readonly DeviceSection[] {
  const needle = query.text.trim().toLowerCase();
  const shown = devices.filter(
    (device) =>
      (needle !== '' || !isDirectoryChild(device)) &&
      roomMatches(device, query.room, rooms) &&
      kindMatches(device, query.kind) &&
      (!query.offline || isOffline(device)) &&
      textMatches(device, needle, rooms),
  );
  const nested = !isFiltering(query);
  return roomGroupsOf(ordered(shown), rooms, (device) => device.room_id).map((group) =>
    sectionOf(group, nested),
  );
}

export function roomOptions(devices: readonly Device[], rooms: Rooms): SelectOption<string>[] {
  const used = orderedRooms(rooms).filter((room) =>
    devices.some((device) => device.room_id === room.id),
  );
  const unplaced = devices.some((device) => roomNameOf(device, rooms) === null);
  return [
    { value: ANY, label: 'All rooms' },
    ...used.map((room) => ({ value: room.id, label: room.name })),
    ...(unplaced ? [{ value: NO_ROOM, label: 'No room' }] : []),
  ];
}

export function kindOptions(devices: readonly Device[]): SelectOption<string>[] {
  const kinds = new Map(
    devices.map((device) => {
      const names = FAMILY_GROUPS[deviceFamily(device)];
      return [names.one, names.many] as const;
    }),
  );
  const sorted = [...kinds].sort(([left], [right]) => compareText(left, right));
  return [
    { value: ANY, label: 'All kinds' },
    ...sorted.map(([value, label]) => ({ value, label })),
  ];
}
