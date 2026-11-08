import type { HomeMap } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { roomGroupsOf } from '../../../../store/room-groups';
import type { Device } from '../../../../store/state';

export interface PickerRoom {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export interface PickerDevice {
  readonly device: Device;
  readonly placed: boolean;
  readonly onMap: boolean;
}

export interface PickerSection {
  readonly key: string;
  readonly title: string;
  readonly current: boolean;
  readonly devices: readonly PickerDevice[];
}

export interface PickerQuery {
  readonly map: HomeMap;
  readonly devices: readonly Device[];
  readonly rooms: readonly PickerRoom[];
  readonly currentRoomId: string | null;
  readonly text: string;
}

function byWaitingThenName(left: PickerDevice, right: PickerDevice): number {
  if (left.placed !== right.placed) return left.placed ? 1 : -1;
  return compareText(left.device.label, right.device.label);
}

function pickerDevices(map: HomeMap, devices: readonly Device[]): readonly PickerDevice[] {
  const placed = new Set(
    map.floors.flatMap((floor) => floor.placements.map((placement) => placement.deviceId)),
  );
  const linked = new Set(
    map.floors.flatMap((floor) => floor.rooms.flatMap((room) => room.homeRoomId ?? [])),
  );
  return devices
    .filter((device) => device.parent_id === null)
    .map((device) => ({
      device,
      placed: placed.has(device.id),
      onMap: device.room_id !== null && linked.has(device.room_id),
    }))
    .sort(byWaitingThenName);
}

export function waitingCount(map: HomeMap, devices: readonly Device[]): number {
  return pickerDevices(map, devices).filter((entry) => !entry.placed).length;
}

export function placeableIds(map: HomeMap, devices: readonly Device[]): readonly string[] {
  return pickerDevices(map, devices)
    .filter((entry) => !entry.placed && entry.onMap)
    .map((entry) => entry.device.id);
}

export function pickerSections(query: PickerQuery): readonly PickerSection[] {
  const needle = query.text.trim().toLocaleLowerCase();
  const groups = roomGroupsOf(
    pickerDevices(query.map, query.devices),
    query.rooms,
    (entry) => entry.device.room_id,
  );
  const sections = groups.flatMap((group): PickerSection[] => {
    const devices =
      needle === '' || group.title.toLocaleLowerCase().includes(needle)
        ? group.devices
        : group.devices.filter((entry) => entry.device.label.toLocaleLowerCase().includes(needle));
    if (devices.length === 0) return [];
    const current = query.currentRoomId !== null && group.key === query.currentRoomId;
    return [{ key: group.key, title: group.title, current, devices }];
  });
  return [...sections.filter((each) => each.current), ...sections.filter((each) => !each.current)];
}
