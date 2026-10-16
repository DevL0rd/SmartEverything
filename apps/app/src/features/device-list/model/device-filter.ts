import { isDirectoryChild } from '../../../plugins/device-contributions';
import { deviceFamily, roomNameOf, type TableRow } from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import { roomGroupsOf, type RoomGroup } from '../../../store/room-groups';
import { orderedRooms } from '../../../store/table-rules';
import type { Device } from '../../../store/state';
import { isOffline } from '../../devices';
import { FAMILY_GROUPS } from './families';

export const ANY = 'any';
export const NO_ROOM = 'none';
export const OFFLINE = 'offline';

export interface DeviceQuery {
  readonly text: string;
  readonly room: string;
  readonly kind: string;
}

type Rooms = readonly TableRow<'rooms'>[];

export function kindOf(device: Device): string {
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
  if (kind === ANY) {
    return true;
  }
  return kind === OFFLINE ? isOffline(device) : kindOf(device) === kind;
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
      left.label.localeCompare(right.label),
  );
}

export function groupedDevices(
  devices: readonly Device[],
  rooms: Rooms,
  query: DeviceQuery,
): readonly RoomGroup<Device>[] {
  const needle = query.text.trim().toLowerCase();
  const shown = devices.filter(
    (device) =>
      (needle !== '' || !isDirectoryChild(device)) &&
      roomMatches(device, query.room, rooms) &&
      kindMatches(device, query.kind) &&
      textMatches(device, needle, rooms),
  );
  return roomGroupsOf(ordered(shown), rooms, (device) => device.room_id);
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
  const sorted = [...kinds].sort(([left], [right]) => left.localeCompare(right));
  return [
    { value: ANY, label: 'All kinds' },
    ...(devices.some(isOffline) ? [{ value: OFFLINE, label: 'Offline' }] : []),
    ...sorted.map(([value, label]) => ({ value, label })),
  ];
}
