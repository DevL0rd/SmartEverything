import { baseNameOf, type NamedDevice, type NamedRoom } from '@smarteverything/domain';
import { naturalCompare } from '../../../format/text';

export interface ListedDevice<Device> {
  readonly device: Device;
  readonly name: string;
}

export interface DeviceGroup<Device> {
  readonly id: string;
  readonly title: string;
  readonly devices: readonly ListedDevice<Device>[];
}

export const NO_ROOM_ID = 'no-room';

export function deviceGroups<Device extends NamedDevice>(
  devices: readonly Device[],
  rooms: readonly NamedRoom[],
): readonly DeviceGroup<Device>[] {
  const byRoom = new Map<string, ListedDevice<Device>[]>();
  const known = new Set(rooms.map((room) => room.id));
  for (const device of devices) {
    const key = device.room_id !== null && known.has(device.room_id) ? device.room_id : NO_ROOM_ID;
    const members = byRoom.get(key) ?? [];
    members.push({ device, name: baseNameOf(device) });
    byRoom.set(key, members);
  }
  const groups: DeviceGroup<Device>[] = [];
  const ordered = [...rooms].sort((left, right) => naturalCompare(left.name, right.name));
  for (const room of ordered) {
    const members = byRoom.get(room.id);
    if (members !== undefined) groups.push(groupOf(room.id, room.name, members));
  }
  const unplaced = byRoom.get(NO_ROOM_ID);
  if (unplaced !== undefined) groups.push(groupOf(NO_ROOM_ID, 'No room', unplaced));
  return groups;
}

function groupOf<Device>(
  id: string,
  title: string,
  members: readonly ListedDevice<Device>[],
): DeviceGroup<Device> {
  return {
    id,
    title,
    devices: [...members].sort((left, right) => naturalCompare(left.name, right.name)),
  };
}
