import { deviceFamily } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export interface ArrangeItem {
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly light: boolean;
}

interface Room {
  readonly id: string;
  readonly name: string;
}

export function arrangeItems(
  devices: readonly Device[],
  rooms: readonly Room[],
  members: readonly string[],
): readonly ArrangeItem[] {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const roomName = new Map(rooms.map((room) => [room.id, room.name]));
  return members.map((id) => {
    const device = byId.get(id);
    if (device === undefined)
      return { id, name: 'Removed device', caption: 'No longer exists', light: false };
    const room = device.room_id === null ? undefined : roomName.get(device.room_id);
    return {
      id,
      name: device.label,
      caption: `${room ?? 'No room'}${device.online ? '' : ' · Offline'}`,
      light: deviceFamily(device) === 'light',
    };
  });
}

export function reordered(members: readonly string[], keys: readonly string[]): readonly string[] {
  const known = new Set(members);
  return keys.filter((key) => known.has(key));
}
