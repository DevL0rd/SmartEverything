import { roomLightTargets, type TargetV2 } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import type { Catalog } from '../data/use-automations';
import { writableCapabilities } from '../model/capability-choices';

export type TargetKind = 'device' | 'devices' | 'room-lights' | 'room' | 'group';

export const KIND_LABELS: Readonly<Record<TargetKind, string>> = {
  device: 'One device',
  devices: 'Several devices',
  'room-lights': 'The lights of a room',
  room: 'A room',
  group: 'A group',
};

const KIND_ORDER: readonly TargetKind[] = ['device', 'devices', 'room-lights', 'room', 'group'];

export function controllable(catalog: Catalog): Catalog['devices'] {
  return catalog.devices.filter((device) => writableCapabilities(device).length > 0);
}

export function roomLightEntries(catalog: Catalog): ReturnType<typeof roomLightTargets> {
  return roomLightTargets(catalog.allDevices, catalog.rooms, compareText);
}

function onlyLights(target: Extract<TargetV2, { room: string }>): boolean {
  return target.families?.length === 1 && target.families[0] === 'light';
}

export function kindOf(target: TargetV2): TargetKind {
  if ('device' in target) return 'device';
  if ('devices' in target) return 'devices';
  if ('group' in target) return 'group';
  return onlyLights(target) ? 'room-lights' : 'room';
}

function firstDevice(catalog: Catalog, current: string | undefined): TargetV2 | null {
  const options = controllable(catalog);
  const device = options.find((entry) => entry.id === current) ?? options[0];
  return device === undefined ? null : { device: device.id };
}

function roomLightsOf(roomId: string): TargetV2 {
  return { room: roomId, families: ['light'] };
}

function firstRoomLights(catalog: Catalog): TargetV2 | null {
  const entry = roomLightEntries(catalog)[0];
  return entry?.target.kind === 'room' ? roomLightsOf(entry.target.roomId) : null;
}

function firstRoom(catalog: Catalog): TargetV2 | null {
  const room = catalog.rooms[0];
  return room === undefined ? null : { room: room.id };
}

function firstGroup(catalog: Catalog): TargetV2 | null {
  const group = catalog.groups[0];
  return group === undefined ? null : { group: group.id };
}

export function targetFor(kind: TargetKind, catalog: Catalog, previous: TargetV2): TargetV2 | null {
  const current = 'device' in previous ? previous.device : undefined;
  switch (kind) {
    case 'device':
      return firstDevice(catalog, current);
    case 'devices':
      return { devices: current === undefined ? [] : [current] };
    case 'room-lights':
      return firstRoomLights(catalog);
    case 'room':
      return firstRoom(catalog);
    case 'group':
      return firstGroup(catalog);
  }
}

function offered(kind: TargetKind, catalog: Catalog): boolean {
  switch (kind) {
    case 'room-lights':
      return roomLightEntries(catalog).length > 0;
    case 'room':
      return catalog.rooms.length > 0;
    case 'group':
      return catalog.groups.length > 0;
    case 'device':
    case 'devices':
      return controllable(catalog).length > 0;
  }
}

export function availableKinds(catalog: Catalog, current: TargetKind): readonly TargetKind[] {
  return KIND_ORDER.filter((kind) => kind === current || offered(kind, catalog));
}

export function roomLightsChoice(catalog: Catalog, roomId: string): string | null {
  return roomLightEntries(catalog).some(
    (entry) => entry.target.kind === 'room' && entry.target.roomId === roomId,
  )
    ? roomId
    : null;
}
