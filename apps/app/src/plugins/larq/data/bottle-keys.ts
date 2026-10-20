import type { BottleReadQuery } from '@smarteverything/domain';

export function bottlePrefix(deviceId: string): readonly ['window', 'bottle', string] {
  return ['window', 'bottle', deviceId];
}

export function bottleKey(
  deviceId: string,
  query: BottleReadQuery,
): readonly ['window', 'bottle', string, BottleReadQuery] {
  return [...bottlePrefix(deviceId), query];
}
