import {
  VACUUM_FAULT_KEY,
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_ROOM_LINKS_KEY,
} from './vacuum-roles';

export const UNRECORDED_RAW_CAPABILITIES: ReadonlySet<string> = new Set([
  VACUUM_MAP_KEY,
  VACUUM_POSE_KEY,
  VACUUM_FAULT_KEY,
  VACUUM_ROOM_LINKS_KEY,
]);

export function isUnrecordedCapability(key: string): boolean {
  return UNRECORDED_RAW_CAPABILITIES.has(key);
}
