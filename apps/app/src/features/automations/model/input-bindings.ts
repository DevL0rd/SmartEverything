import type {
  AutomationBinding,
  AutomationBindingKind,
  AutomationInput,
  DeviceCapability,
  JsonValue,
} from '@smarteverything/domain';
import type { Catalog } from '../data/use-automations';
import { readableCapabilities, type DeviceLike } from './capability-choices';

export function literalValue(kind: AutomationBindingKind): JsonValue {
  if (kind === 'boolean') return false;
  return kind === 'number' || kind === 'duration' ? 0 : '';
}
export function literalInput(kind: AutomationBindingKind): AutomationInput {
  return { binding: { source: 'literal', kind, value: literalValue(kind) } };
}
export function inputCapabilities(
  device: DeviceLike,
  kind: AutomationBindingKind,
): readonly DeviceCapability[] {
  return readableCapabilities(device).filter((capability) => {
    const descriptor = capability.value;
    switch (kind) {
      case 'boolean':
        return descriptor.kind === 'boolean';
      case 'number':
        return descriptor.kind === 'number';
      case 'duration':
        return descriptor.kind === 'number' && descriptor.unit === 'ms';
      case 'string':
        return descriptor.kind === 'text' || descriptor.kind === 'enum';
      case 'choice':
        return false;
    }
  });
}
export interface BindingSourceChoice {
  readonly value: AutomationBinding['source'];
  readonly label: string;
  readonly binding: AutomationBinding;
}
export function bindingSourceChoices(
  catalog: Catalog,
  kind: AutomationBindingKind,
): readonly BindingSourceChoice[] {
  const value = catalog.values?.find((row) => row.content.kind === kind);
  const parameter = catalog.parameters?.find((row) => row.kind === kind);
  const device = catalog.devices.find((row) => inputCapabilities(row, kind).length > 0);
  const capability = device === undefined ? undefined : inputCapabilities(device, kind)[0];
  const choices: BindingSourceChoice[] = [
    { value: 'literal', label: 'A fixed value', binding: literalInput(kind).binding },
  ];
  if (value !== undefined)
    choices.push({
      value: 'value',
      label: 'A remembered Value',
      binding: { source: 'value', kind, valueId: value.id },
    });
  if (parameter !== undefined)
    choices.push({
      value: 'parameter',
      label: 'A sequence parameter',
      binding: { source: 'parameter', kind, name: parameter.name },
    });
  if (device !== undefined && capability !== undefined)
    choices.push({
      value: 'capability',
      label: 'A device’s current state',
      binding: { source: 'capability', kind, deviceId: device.id, capability: capability.key },
    });
  return choices;
}

export function bindingProblem(catalog: Catalog, binding: AutomationBinding): string | null {
  switch (binding.source) {
    case 'literal':
      return null;
    case 'value':
      return catalog.values?.some(
        (row) => row.id === binding.valueId && row.content.kind === binding.kind,
      ) === true
        ? null
        : 'This Value is missing or has a different type. Select a compatible source.';
    case 'parameter':
      return catalog.parameters?.some(
        (row) => row.name === binding.name && row.kind === binding.kind,
      ) === true
        ? null
        : 'This parameter is missing or has a different type. Select a compatible source.';
    case 'capability':
      return capabilityBindingProblem(catalog, binding);
  }
}
function capabilityBindingProblem(
  catalog: Catalog,
  binding: Extract<AutomationBinding, { source: 'capability' }>,
): string | null {
  const device = catalog.allDevices.find((row) => row.id === binding.deviceId);
  return device !== undefined &&
    inputCapabilities(device, binding.kind).some((row) => row.key === binding.capability)
    ? null
    : 'This device state is missing or incompatible. Select a compatible source.';
}
