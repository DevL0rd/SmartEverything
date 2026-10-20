import type { TreadmillReadQuery } from '@smarteverything/domain';

export function treadmillPrefix(deviceId: string): readonly ['window', 'treadmill', string] {
  return ['window', 'treadmill', deviceId];
}

export function treadmillKey(
  deviceId: string,
  query: TreadmillReadQuery,
): readonly ['window', 'treadmill', string, TreadmillReadQuery] {
  return [...treadmillPrefix(deviceId), query];
}
