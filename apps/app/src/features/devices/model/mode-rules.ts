import {
  withRole,
  type CapabilityRole,
  type DeviceFamily,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { valueOf, type DeviceModel } from './device-model';

const MODE_ROLES: readonly CapabilityRole[] = ['purifier_mode', 'mode', 'hvac_mode'];

interface ModeContext {
  readonly family: DeviceFamily;
  readonly mode: string | null;
  readonly oscillating: boolean;
}

type Rule = (context: ModeContext) => boolean;

const inMode =
  (pattern: RegExp): Rule =>
  (context) =>
    context.mode !== null && pattern.test(context.mode);

const SHOWN_WHEN: Partial<Readonly<Record<CapabilityRole, Rule>>> = {
  favourite_level: inMode(/favou?rite/i),
  manual_level: inMode(/manual/i),
  swing_angle: (context) => context.oscillating,
};

const FAMILY_RULES: Partial<
  Readonly<Record<DeviceFamily, Partial<Readonly<Record<CapabilityRole, Rule>>>>>
> = {
  air_purifier: { fan_mode: inMode(/manual/i) },
};

function modeOf(model: DeviceModel, values: DeviceValues): string | null {
  for (const role of MODE_ROLES) {
    const value = valueOf(values, withRole(model.presentation, role));
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

export function modeContextOf(model: DeviceModel, values: DeviceValues): ModeContext {
  return {
    family: model.family,
    mode: modeOf(model, values),
    oscillating: valueOf(values, withRole(model.presentation, 'oscillation')) === true,
  };
}

export function shownInMode(presented: PresentedCapability, context: ModeContext): boolean {
  if (presented.role === null) {
    return true;
  }
  const rule = FAMILY_RULES[context.family]?.[presented.role] ?? SHOWN_WHEN[presented.role];
  return rule === undefined || rule(context);
}
