import type { DeviceRow, RoomRow } from './api/rows-home';
import type { DeviceGroupRow } from './device-groups';
import { targetDevices, type DeviceTarget } from './device-targets';
import { deviceFamily } from './presentation/device-family';

export const ROOM_LIGHTS_MINIMUM = 2;

export type TargetKind = 'group' | 'room-lights';

export interface TargetEntry<T extends DeviceRow = DeviceRow> {
  readonly key: string;
  readonly target: DeviceTarget;
  readonly name: string;
  readonly kind: TargetKind;
  readonly members: readonly T[];
  readonly lost: number;
}

export type TextOrder = (left: string, right: string) => number;

export function targetKey(target: DeviceTarget): string {
  switch (target.kind) {
    case 'group':
      return `group:${target.groupId}`;
    case 'room':
      return `room-lights:${target.roomId}`;
    case 'devices':
      return `devices:${target.deviceIds.join(',')}`;
  }
}

export function roomLightsTarget(roomId: string): DeviceTarget {
  return { kind: 'room', roomId, families: ['light'] };
}

export function visibleLights<T extends DeviceRow>(devices: readonly T[]): readonly T[] {
  return devices.filter((device) => !device.hidden && deviceFamily(device) === 'light');
}

export function roomLightsName(room: Pick<RoomRow, 'name'>): string {
  return `${room.name} lights`;
}

function roomEntry<T extends DeviceRow>(
  devices: readonly T[],
  room: RoomRow,
): TargetEntry<T> | null {
  const target = roomLightsTarget(room.id);
  const members = targetDevices(devices, [], target);
  if (members.length < ROOM_LIGHTS_MINIMUM) return null;
  return {
    key: targetKey(target),
    target,
    name: roomLightsName(room),
    kind: 'room-lights',
    members,
    lost: 0,
  };
}

function groupEntry<T extends DeviceRow>(
  devices: readonly T[],
  group: DeviceGroupRow,
): TargetEntry<T> {
  const target: DeviceTarget = { kind: 'group', groupId: group.id };
  const byId = new Map(devices.map((device) => [device.id, device]));
  const members = group.device_ids.flatMap((id) => {
    const device = byId.get(id);
    return device === undefined ? [] : [device];
  });
  return {
    key: targetKey(target),
    target,
    name: group.name,
    kind: 'group',
    members,
    lost: group.device_ids.length - members.length,
  };
}

export function roomLightTargets<T extends DeviceRow>(
  devices: readonly T[],
  rooms: readonly RoomRow[],
  compareText: TextOrder,
): readonly TargetEntry<T>[] {
  return [...rooms]
    .sort((left, right) => left.position - right.position || compareText(left.name, right.name))
    .flatMap((room) => {
      const entry = roomEntry(devices, room);
      return entry === null ? [] : [entry];
    });
}

export function groupTargets<T extends DeviceRow>(
  devices: readonly T[],
  groups: readonly DeviceGroupRow[],
): readonly TargetEntry<T>[] {
  return groups.map((group) => groupEntry(devices, group));
}

export function targetEntry<T extends DeviceRow>(
  devices: readonly T[],
  groups: readonly DeviceGroupRow[],
  rooms: readonly RoomRow[],
  target: DeviceTarget,
): TargetEntry<T> | null {
  if (target.kind === 'group') {
    const group = groups.find((candidate) => candidate.id === target.groupId);
    return group === undefined ? null : groupEntry(devices, group);
  }
  if (target.kind === 'room' && target.families?.length === 1 && target.families[0] === 'light') {
    const room = rooms.find((candidate) => candidate.id === target.roomId);
    return room === undefined ? null : roomEntry(devices, room);
  }
  return null;
}
