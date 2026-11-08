import type { VacuumSlot } from '@smarteverything/domain';

export const VACUUM_QUERY_PREFIX = ['window', 'vacuum'] as const;

export function vacuumDeviceScenesKey(
  deviceId: string,
): readonly ['window', 'vacuum', 'scene', string] {
  return [...VACUUM_QUERY_PREFIX, 'scene', deviceId];
}

export function vacuumSceneKey(
  deviceId: string,
  slot: VacuumSlot,
  version: string,
  links: string,
): readonly ['window', 'vacuum', 'scene', string, VacuumSlot, string, string] {
  return [...VACUUM_QUERY_PREFIX, 'scene', deviceId, slot, version, links];
}

export function vacuumRoomLinksKey(
  deviceId: string,
  version: string,
  links: string,
): readonly ['window', 'vacuum', 'room-links', string, string, string] {
  return [...VACUUM_QUERY_PREFIX, 'room-links', deviceId, version, links];
}

export function vacuumCleansKey(
  deviceId: string,
  finishedCleans: number | null,
): readonly ['window', 'vacuum', 'cleans', string, number | null] {
  return [...VACUUM_QUERY_PREFIX, 'cleans', deviceId, finishedCleans];
}

export function vacuumCleanKey(
  deviceId: string,
  cleanId: string,
): readonly ['window', 'vacuum', 'clean', string, string] {
  return [...VACUUM_QUERY_PREFIX, 'clean', deviceId, cleanId];
}
