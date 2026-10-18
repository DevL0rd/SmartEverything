import { isFrom } from './automation-v2-eval';
import type { TargetV2, ToV2 } from './automation-v2-schema';
import type { DeviceTarget } from './device-targets';
import type { JsonValue } from './values';

export function deviceTargetOf(target: TargetV2): DeviceTarget {
  if ('device' in target) return { kind: 'devices', deviceIds: [target.device] };
  if ('devices' in target) return { kind: 'devices', deviceIds: target.devices };
  if ('group' in target) return { kind: 'group', groupId: target.group };
  return {
    kind: 'room',
    roomId: target.room,
    ...(target.families === undefined ? {} : { families: target.families }),
  };
}

export function staticValueOf(to: ToV2): JsonValue | undefined {
  if (isFrom(to)) return undefined;
  if (typeof to !== 'object' || to === null || Array.isArray(to)) return to;
  const entries = Object.entries(to);
  const literals = entries.flatMap(([key, field]) =>
    isFrom(field) ? [] : [[key, field] as const],
  );
  return literals.length === entries.length ? Object.fromEntries(literals) : undefined;
}

export function readsLive(to: ToV2): boolean {
  return staticValueOf(to) === undefined;
}
