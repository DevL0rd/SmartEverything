import type { BrushReadQuery } from '@smarteverything/domain';

export function brushPrefix(deviceId: string): readonly ['window', 'toothbrush', string] {
  return ['window', 'toothbrush', deviceId];
}

export function brushKey(
  deviceId: string,
  query: BrushReadQuery,
): readonly ['window', 'toothbrush', string, BrushReadQuery] {
  return [...brushPrefix(deviceId), query];
}
