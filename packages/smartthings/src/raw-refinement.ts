import { type JsonValue, type ValueDescriptor } from '@smarteverything/domain';
import type { Binding, RawBinding } from './bindings';
import { SmartThingsCommandError } from './errors';
import { attributeValue, stringList } from './mapper-kit';
import { refineMicrowaveBinding } from './microwave-bindings';
import { validateMicrowaveWrite } from './microwave-command';
import type { ComponentStatus } from './rest-schemas';
import { refineTvModeBinding, TV_MODE_OPTIONS } from './tv-mode-bindings';

const SUPPORTED_OPTIONS: Readonly<Record<string, string>> = {
  'ovenMode.ovenMode': 'supportedOvenModes',
  'samsungce.ovenMode.ovenMode': 'supportedOvenModes',
  'samsungce.lamp.brightnessLevel': 'supportedBrightnessLevel',
  ...TV_MODE_OPTIONS,
};

function supportedOptions(binding: Binding, status: ComponentStatus): readonly string[] {
  const source = binding.sources[0];
  const attribute =
    source === undefined
      ? undefined
      : SUPPORTED_OPTIONS[`${source.capability}.${source.attribute}`];
  return source === undefined || attribute === undefined
    ? []
    : stringList(attributeValue(status, source.capability, attribute));
}

function descriptorFor(binding: RawBinding, status: ComponentStatus): ValueDescriptor {
  const options = supportedOptions(binding, status);
  return options.length === 0 ? binding.capability.value : { kind: 'enum', options: [...options] };
}

export function refineRawBinding(binding: RawBinding, status: ComponentStatus): RawBinding {
  const refined = refineTvModeBinding(refineMicrowaveBinding(binding, status), status);
  return {
    ...refined,
    capability: { ...refined.capability, value: descriptorFor(refined, status) },
  };
}

export function validateRawWrite(
  binding: Binding,
  status: ComponentStatus,
  value: JsonValue,
): void {
  const options = supportedOptions(binding, status);
  if (options.length > 0 && (typeof value !== 'string' || !options.includes(value))) {
    throw new SmartThingsCommandError(
      binding.capability.key,
      value,
      `not one of the settings the device currently supports (${options.join(', ')})`,
    );
  }
  validateMicrowaveWrite(binding, status, value);
}
