import {
  levelRangeOf,
  withRole,
  type LevelRange,
  type CapabilityRole,
  type DeviceFamily,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { DeviceModel } from '../model/device-model';

export interface StageLevel {
  readonly presented: PresentedCapability;
  readonly range: LevelRange;
}

const STAGE_ROLES: Partial<Readonly<Record<DeviceFamily, CapabilityRole>>> = {
  light: 'brightness',
  fan: 'fan_speed',
  tower_fan: 'fan_speed',
};

export function stageLevelOf(model: DeviceModel): StageLevel | null {
  const role = STAGE_ROLES[model.family];
  const presented = role === undefined ? undefined : withRole(model.presentation, role);
  const range = presented === undefined ? null : levelRangeOf(presented);
  if (presented === undefined || !presented.writable || range === null) {
    return null;
  }
  return { presented, range };
}

const NOTHING_STAGED: ReadonlySet<CapabilityRole> = new Set();
const BRIGHTNESS_STAGED: ReadonlySet<CapabilityRole> = new Set(['brightness']);
const SPEED_STAGED: ReadonlySet<CapabilityRole> = new Set(['fan_speed']);

export function stagedRoles(model: DeviceModel): ReadonlySet<CapabilityRole> {
  const role = stageLevelOf(model)?.presented.role;
  if (role === 'brightness') {
    return BRIGHTNESS_STAGED;
  }
  return role === 'fan_speed' ? SPEED_STAGED : NOTHING_STAGED;
}
