import {
  groupControlChoices as sharedChoices,
  type GroupControlChoice,
} from '@smarteverything/domain';
import { shallowEqual } from '../../store/store-context';
import type { Device } from '../../store/state';

interface Cached {
  readonly members: readonly Device[];
  readonly choices: readonly GroupControlChoice<Device>[];
}

const NONE: readonly GroupControlChoice<Device>[] = [];
const BY_FIRST_MEMBER = new WeakMap<Device, Cached>();

export function groupControlChoices(
  devices: readonly Device[],
): readonly GroupControlChoice<Device>[] {
  const first = devices[0];
  if (first === undefined) return NONE;
  const hit = BY_FIRST_MEMBER.get(first);
  if (hit !== undefined && shallowEqual(hit.members, devices)) return hit.choices;
  const choices = sharedChoices(devices);
  BY_FIRST_MEMBER.set(first, { members: devices, choices });
  return choices;
}
