import {
  numberPresets,
  pickableControls,
  presentDevice,
  type DeviceCapability,
  type JsonValue,
  type ValueDescriptor,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';

export type DeviceLike = Pick<Device, 'id' | 'label' | 'kind' | 'model' | 'capabilities'>;

export function isReadable(capability: DeviceCapability): boolean {
  return capability.access !== 'write' && capability.value.kind !== 'action';
}

export function isWritable(capability: DeviceCapability): boolean {
  return capability.access !== 'read';
}

export function writableCapabilities(device: DeviceLike): DeviceCapability[] {
  return pickableControls(device).map((presented) => presented.capability);
}

const SCENE_TIERS: ReadonlySet<string> = new Set(['primary', 'control']);

export function sceneCapabilities(device: DeviceLike): DeviceCapability[] {
  const allowed = new Set(writableCapabilities(device).map((capability) => capability.key));
  return presentDevice(device)
    .capabilities.filter(
      (presented) => SCENE_TIERS.has(presented.tier) && allowed.has(presented.capability.key),
    )
    .map((presented) => presented.capability);
}

const DEFAULT_COLOUR = { hue: 32, saturation: 52, value: 100 } as const;

export function defaultValue(descriptor: ValueDescriptor): JsonValue {
  switch (descriptor.kind) {
    case 'boolean':
      return true;
    case 'number':
      return numberPresets(descriptor)[2] ?? descriptor.min;
    case 'enum':
      return descriptor.options[0] ?? null;
    case 'color':
      return DEFAULT_COLOUR;
    case 'text':
      return '';
    case 'action':
      return actionDefault(descriptor);
  }
}

function actionDefault(descriptor: Extract<ValueDescriptor, { kind: 'action' }>): JsonValue {
  if (descriptor.argumentSchema !== undefined) {
    return {};
  }
  return descriptor.arguments === undefined
    ? null
    : Object.fromEntries(descriptor.arguments.map((name) => [name, '']));
}
