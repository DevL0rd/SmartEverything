import { compareText } from '../../format/text';
import { roomGroupsOf } from '../../store/room-groups';
import type { Device } from '../../store/state';

interface MemberRoom {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export interface MemberQuery {
  readonly text: string;
  readonly hidden: boolean;
}

export interface MemberSection {
  readonly key: string;
  readonly title: string;
  readonly devices: readonly Device[];
}

export function memberSections(
  devices: readonly Device[],
  rooms: readonly MemberRoom[],
  members: readonly string[],
  query: MemberQuery,
): readonly MemberSection[] {
  const needle = query.text.trim().toLowerCase();
  const chosen = new Set(members);
  const listed = devices
    .filter((device) => query.hidden || !device.hidden || chosen.has(device.id))
    .sort((left, right) => compareText(left.label, right.label));
  return roomGroupsOf(listed, rooms, (device) => device.room_id).flatMap((group) => {
    const matching =
      needle === '' || group.title.toLowerCase().includes(needle)
        ? group.devices
        : group.devices.filter((device) => device.label.toLowerCase().includes(needle));
    return matching.length === 0 ? [] : [{ key: group.key, title: group.title, devices: matching }];
  });
}

export function selectedIn(members: readonly string[], section: MemberSection): number {
  return section.devices.filter((device) => members.includes(device.id)).length;
}

export function withSection(
  members: readonly string[],
  section: MemberSection,
  selected: boolean,
): readonly string[] {
  const ids = section.devices.map((device) => device.id);
  return selected
    ? [...members, ...ids.filter((id) => !members.includes(id))]
    : members.filter((id) => !ids.includes(id));
}

export function withDevice(
  members: readonly string[],
  deviceId: string,
  selected: boolean,
): readonly string[] {
  if (!selected) return members.filter((member) => member !== deviceId);
  return members.includes(deviceId) ? members : [...members, deviceId];
}

export function missingMembers(
  devices: readonly Device[],
  members: readonly string[],
): readonly string[] {
  const known = new Set(devices.map((device) => device.id));
  return members.filter((id) => !known.has(id));
}
