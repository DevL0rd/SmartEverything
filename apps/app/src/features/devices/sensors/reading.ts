import type { DeviceCapability } from '@smarteverything/domain';
import type { DeviceValues } from '../../../store/state';

export function numberAt(values: DeviceValues, key: string | undefined): number | null {
  const value = key === undefined ? undefined : values[key]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function levelPercent(capability: DeviceCapability, value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (capability.value.kind !== 'number') {
    return value;
  }
  const { min, max } = capability.value;
  return max === min ? null : ((value - min) / (max - min)) * 100;
}
