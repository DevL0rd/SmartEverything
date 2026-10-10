import { useMemo } from 'react';
import {
  deviceFamily,
  presentDevice,
  presentValue,
  sleepsBetweenUse,
  withRole,
  type DeviceFamily,
  type DevicePresentation,
  type JsonValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';

export interface DeviceModel {
  readonly device: Device;
  readonly family: DeviceFamily;
  readonly presentation: DevicePresentation;
  readonly power: PresentedCapability | null;
  readonly sleepy: boolean;
}

export type PowerState = 'on' | 'off' | 'offline' | 'unknown' | 'none';

function powerOf(presentation: DevicePresentation): PresentedCapability | null {
  const power = withRole(presentation, 'power');
  return power !== undefined && power.writable && power.capability.value.kind === 'boolean'
    ? power
    : null;
}

export function deviceModelOf(device: Device): DeviceModel {
  const presentation = presentDevice(device);
  return {
    device,
    family: deviceFamily(device),
    presentation,
    power: powerOf(presentation),
    sleepy: sleepsBetweenUse(device),
  };
}

export function useDeviceModel(device: Device): DeviceModel {
  return useMemo(() => deviceModelOf(device), [device]);
}

export function valueOf(
  values: DeviceValues,
  presented: PresentedCapability | null | undefined,
): JsonValue | undefined {
  return presented === null || presented === undefined ? undefined : values[presented.key]?.value;
}

export function powerStateOf(model: DeviceModel, values: DeviceValues): PowerState {
  if (model.power === null) {
    return 'none';
  }
  if (!model.device.online) {
    return 'offline';
  }
  const value = valueOf(values, model.power);
  if (typeof value !== 'boolean') {
    return 'unknown';
  }
  return value ? 'on' : 'off';
}

export function shownValue(presented: PresentedCapability, value: JsonValue | undefined): string {
  return value === undefined ? 'No reading yet' : presentValue(presented, value);
}

export function hasValue(values: DeviceValues, presented: PresentedCapability): boolean {
  return values[presented.key] !== undefined;
}
