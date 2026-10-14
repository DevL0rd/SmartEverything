import { checkValue, type JsonValue, type ValueDescriptor } from '@smarteverything/domain';
import type { RawBinding, SmartThingsCommand } from './bindings';
import { attributeValue, stringList } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';
import { validateMicrowaveWrite, validateMicrowaveLamp } from './microwave-command';
import type { Binding } from './bindings';
import { refineMicrowaveBinding } from './microwave-bindings';

const SUPPORTED_OPTIONS: Readonly<Record<string, string>> = {
  'ovenMode.ovenMode': 'supportedOvenModes',
  'samsungce.ovenMode.ovenMode': 'supportedOvenModes',
  'samsungce.microwavePower.powerLevel': 'supportedPowerLevels',
  'samsungce.lamp.brightnessLevel': 'supportedBrightnessLevel',
};

function descriptorFor(binding: RawBinding, status: ComponentStatus): ValueDescriptor {
  const source = binding.sources[0];
  if (source === undefined) {
    return binding.capability.value;
  }
  const supported = SUPPORTED_OPTIONS[`${source.capability}.${source.attribute}`];
  if (supported === undefined) {
    return binding.capability.value;
  }
  const options = stringList(attributeValue(status, source.capability, supported));
  return options.length === 0 ? binding.capability.value : { kind: 'enum', options: [...options] };
}

const RAW_REFINERS = [refineMicrowaveBinding] as const;
const RAW_VALIDATORS = [validateMicrowaveWrite, validateMicrowaveLamp] as const;

export function refineRawBinding(binding: RawBinding, status: ComponentStatus): RawBinding {
  const refined = RAW_REFINERS.reduce((current, refine) => refine(current, status), binding);
  const value = descriptorFor(refined, status);
  const write = refined.write;
  return {
    ...refined,
    capability: { ...refined.capability, value },
    write:
      write === null
        ? null
        : (written: JsonValue): readonly SmartThingsCommand[] => write(checkValue(value, written)),
  };
}

export function validateRawWrite(
  binding: Binding,
  status: ComponentStatus,
  value: JsonValue,
): void {
  for (const validate of RAW_VALIDATORS) {
    validate(binding, status, value);
  }
}
