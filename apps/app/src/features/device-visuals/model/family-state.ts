import {
  laundryValuesOf,
  LaundryValueError,
  withRole,
  type CapabilityRole,
  type DeviceFamily,
} from '@smarteverything/domain';
import type { DetectionFacts, Illumination, LaundryFacts, VisualState } from '../types';
import type { Decorate } from './facts/decorate';
import { bottleState } from './facts/bottle';
import { diffuserState } from './facts/diffuser';
import { microwaveState } from './facts/microwave';
import { phoneState } from './facts/phone';
import { robotState } from './facts/robot';
import { toothbrushState } from './facts/toothbrush';
import { treadmillState } from './facts/treadmill';
import { LAUNDRY_UNKNOWN, laundryFacts } from './laundry-facts';
import { numberOf, textOf, type Lookup } from './lookup';

const ILLUMINATIONS: readonly Illumination[] = ['dark', 'twilight', 'bright'];

function laundryFactsOf(lookup: Lookup): LaundryFacts {
  const values = laundryValuesOf(
    lookup.presentation.capabilities,
    (key) => lookup.values[key]?.value,
  );
  try {
    return laundryFacts(values) ?? LAUNDRY_UNKNOWN;
  } catch (error) {
    if (error instanceof LaundryValueError) {
      return LAUNDRY_UNKNOWN;
    }
    throw error;
  }
}

const laundryState: Decorate = (base, lookup) => {
  const laundry = laundryFactsOf(lookup);
  return { ...base, power: laundry.phase === 'off' ? 'off' : 'on', laundry };
};

function detectionFacts(lookup: Lookup): DetectionFacts {
  const light = textOf(lookup, 'illumination');
  return {
    objects: numberOf(lookup, 'object_count'),
    light: ILLUMINATIONS.find((known) => known === light) ?? null,
  };
}

const RADAR_ROLES: readonly CapabilityRole[] = ['object_count', 'illumination'];

const sensorState: Decorate = (base, lookup) =>
  base.presence !== null &&
  RADAR_ROLES.some((role) => withRole(lookup.presentation, role) !== undefined)
    ? { ...base, detection: detectionFacts(lookup) }
    : base;

const FAMILY_STATES: Readonly<Partial<Record<DeviceFamily, Decorate>>> = {
  microwave: microwaveState,
  laundry: laundryState,
  diffuser: diffuserState,
  robot: robotState,
  phone: phoneState,
  treadmill: treadmillState,
  bottle: bottleState,
  toothbrush: toothbrushState,
  sensor: sensorState,
};

export function familyVisualState(
  family: DeviceFamily,
  base: VisualState,
  lookup: Lookup,
): VisualState {
  const decorate = FAMILY_STATES[family];
  return decorate === undefined ? base : decorate(base, lookup);
}
