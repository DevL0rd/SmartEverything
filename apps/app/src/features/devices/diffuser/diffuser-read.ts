import {
  diffuserStrength,
  withRole,
  type CapabilityRole,
  type DiffuserStrength,
  type SprayRhythm,
} from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';
import { powerStateOf, valueOf, type DeviceModel, type PowerState } from '../model/device-model';

export interface DiffuserRead {
  readonly power: PowerState;
  readonly fault: boolean;
  readonly rhythm: SprayRhythm | null;
  readonly strength: DiffuserStrength | null;
  readonly battery: number | null;
  readonly charging: boolean;
  readonly light: boolean | null;
}

function numberAt(model: DeviceModel, values: DeviceValues, role: CapabilityRole): number | null {
  const value = valueOf(values, withRole(model.presentation, role));
  return typeof value === 'number' ? value : null;
}

function flagAt(model: DeviceModel, values: DeviceValues, role: CapabilityRole): boolean | null {
  const value = valueOf(values, withRole(model.presentation, role));
  return typeof value === 'boolean' ? value : null;
}

function rhythmOf(model: DeviceModel, values: DeviceValues): SprayRhythm | null {
  const intervalMinutes = numberAt(model, values, 'spray_interval');
  const durationSeconds = numberAt(model, values, 'spray_duration');
  return intervalMinutes === null || durationSeconds === null
    ? null
    : { intervalMinutes, durationSeconds };
}

export function readDiffuser(model: DeviceModel, values: DeviceValues): DiffuserRead {
  const rhythm = rhythmOf(model, values);
  return {
    power: powerStateOf(model, values),
    fault: flagAt(model, values, 'fault') === true,
    rhythm,
    strength: rhythm === null ? null : diffuserStrength(rhythm),
    battery: numberAt(model, values, 'battery'),
    charging: valueOf(values, withRole(model.presentation, 'charging_state')) === 'Charging',
    light: flagAt(model, values, 'ambient_light'),
  };
}
