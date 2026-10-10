import {
  presentCapability,
  presentValue,
  type DeviceCapability,
  type JsonValue,
} from '@smarteverything/domain';
import type { DeviceLike } from './capability-choices';

export function capabilityLabel(device: DeviceLike, capability: DeviceCapability): string {
  return presentCapability(device, capability).label;
}

export function valueLabel(
  device: DeviceLike,
  capability: DeviceCapability,
  value: JsonValue,
): string {
  return presentValue({ ...presentCapability(device, capability), capability }, value);
}

export function optionsOf(
  device: DeviceLike,
  capability: DeviceCapability,
): readonly { readonly value: string; readonly label: string }[] {
  return presentCapability(device, capability).options;
}

export function unitOf(device: DeviceLike, capability: DeviceCapability): string | null {
  return presentCapability(device, capability).unit;
}

export interface Subject {
  readonly device: DeviceLike | undefined;
  readonly capability: DeviceCapability | undefined;
  readonly key: string;
}

export function subjectOf(devices: readonly DeviceLike[], deviceId: string, key: string): Subject {
  const device = devices.find((candidate) => candidate.id === deviceId);
  const capability = device?.capabilities.find((candidate) => candidate.key === key);
  return { device, capability, key };
}

export function subjectValue(subject: Subject, value: JsonValue): string {
  if (subject.device === undefined || subject.capability === undefined) {
    return typeof value === 'object' ? 'a value' : String(value);
  }
  return valueLabel(subject.device, subject.capability, value);
}

export function subjectLabel(subject: Subject): string {
  if (subject.device === undefined || subject.capability === undefined) {
    return 'a removed setting';
  }
  const label = capabilityLabel(subject.device, subject.capability);
  return /^[A-Z][a-z]/.test(label) ? `${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
}
