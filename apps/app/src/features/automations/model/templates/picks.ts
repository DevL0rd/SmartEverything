import { capabilityOf, type DeviceCapability } from '@smarteverything/domain';
import type { TemplateDevice } from './parameters';

export const MOST_LIGHTS = 6;

export function isReadable(capability: DeviceCapability): boolean {
  return capability.access !== 'write' && capability.value.kind !== 'action';
}

export function isWritable(capability: DeviceCapability): boolean {
  return capability.access !== 'read';
}

export type PickKey =
  'power' | 'purifier_mode' | 'leak' | 'smoke' | 'motion' | 'contact' | 'pm25' | 'humidity';

export function withCapability(
  devices: readonly TemplateDevice[],
  key: PickKey,
  usable: (capability: DeviceCapability) => boolean,
): TemplateDevice[] {
  return devices.filter((device) => {
    const capability = capabilityOf(device, key);
    return capability !== undefined && usable(capability);
  });
}

export function allLights(devices: readonly TemplateDevice[]): TemplateDevice[] {
  return withCapability(devices, 'power', isWritable).filter((device) => device.kind === 'light');
}

export function lightsOf(devices: readonly TemplateDevice[]): TemplateDevice[] {
  return allLights(devices).slice(0, MOST_LIGHTS);
}

export function idsOf(devices: readonly TemplateDevice[]): string[] {
  return devices.map((device) => device.id);
}

export function labelsOf(devices: readonly TemplateDevice[]): string[] {
  return devices.map((device) => device.label);
}
