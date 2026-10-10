import type { DeviceCapability } from '../devices';
import type { Danger } from './types';

const NO_DANGER: Danger = { tier: 'none' };

const TYPED: readonly (readonly [RegExp, string])[] = [
  [/\bformat\b/i, 'FORMAT'],
  [/factory|reset all/i, 'RESET'],
  [/del(ete)?[\s_-]?users?\b|\bdelete\b/i, 'DELETE'],
  [/\b(wipe|erase)\b/i, 'ERASE'],
];

const CONFIRMED = /restart|reboot|reset|calibrate|calibration|eject|pop up/i;

export function dangerOf(capability: DeviceCapability): Danger {
  if (capability.value.kind !== 'action') {
    return NO_DANGER;
  }
  const typed = TYPED.find(([pattern]) => pattern.test(capability.label));
  if (typed !== undefined) {
    return { tier: 'typed', word: typed[1] };
  }
  return CONFIRMED.test(capability.label) ? { tier: 'confirm' } : NO_DANGER;
}
