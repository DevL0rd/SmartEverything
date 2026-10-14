import {
  MICROWAVE_KEYS,
  MICROWAVE_SPECIFICATION,
  MICROWAVE_DURATION,
  microwaveProgramError,
  microwaveDuration,
  microwavePowerOptions,
  microwaveReadiness,
  type JsonValue,
  type MicrowaveMode,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Binding } from './bindings';
import { SmartThingsCommandError } from './errors';
import { attributeValue } from './mapper-kit';
import type { ComponentStatus } from './rest-schemas';

const COOKING_CAPABILITIES = new Set([
  'ovenMode',
  'ovenSetpoint',
  'ovenOperatingState',
  'samsungce.ovenMode',
  'samsungce.ovenOperatingState',
  'samsungce.microwavePower',
  'samsungce.definedRecipe',
  'samsungce.cookRecipe',
]);
const OPERATIONS: Readonly<Record<string, string>> = {
  [MICROWAVE_KEYS.start]: 'start',
  [MICROWAVE_KEYS.pause]: 'pause',
  [MICROWAVE_KEYS.stop]: 'stop',
  'raw:oven_operating_state:start': 'start',
  'raw:oven_operating_state:stop': 'stop',
};
function flatValues(status: ComponentStatus): Readonly<Record<string, JsonValue | undefined>> {
  return {
    [MICROWAVE_KEYS.remote]: attributeValue(status, 'remoteControlStatus', 'remoteControlEnabled'),
    [MICROWAVE_KEYS.door]: attributeValue(status, 'samsungce.doorState', 'doorState'),
    [MICROWAVE_KEYS.lock]: attributeValue(status, 'samsungce.kidsLock', 'lockState'),
  };
}
function modeOf(status: ComponentStatus): MicrowaveMode {
  const specification = MICROWAVE_SPECIFICATION.parse(
    attributeValue(status, 'samsungce.kitchenModeSpecification', 'specification'),
  );
  const name = attributeValue(status, 'samsungce.ovenMode', 'ovenMode');
  const mode = specification.single.find((entry) => entry.mode === name);
  if (mode === undefined) {
    throw new SmartThingsCommandError(
      'cooking mode',
      name ?? null,
      'current mode has no specification',
    );
  }
  return mode;
}
function valueCheck(
  key: string,
  value: JsonValue,
  status: ComponentStatus,
  mode: MicrowaveMode,
): void {
  const options = mode.supportedOptions;
  const fields: Readonly<Record<string, (written: JsonValue) => string | null>> = {
    [MICROWAVE_KEYS.setDuration]: (written) => {
      const duration = z
        .strictObject({ operationTime: MICROWAVE_DURATION })
        .parse(written).operationTime;
      return options.operationTime === undefined
        ? 'This mode does not support a duration.'
        : microwaveProgramError(
            { mode: mode.mode, duration, power: '', temperature: 0 },
            { ...mode, supportedOptions: { operationTime: options.operationTime } },
            [],
            'C',
          );
    },
    [MICROWAVE_KEYS.power]: (written) =>
      microwavePowerOptions(
        mode,
        attributeValue(status, 'samsungce.microwavePower', 'supportedPowerLevels'),
      ).includes(z.string().parse(written))
        ? null
        : 'This power is not supported by the current mode.',
    [MICROWAVE_KEYS.temperature]: (written) =>
      options.temperature === undefined
        ? 'This mode does not support temperature.'
        : microwaveProgramError(
            {
              mode: mode.mode,
              duration: '00:00:00',
              power: '',
              temperature: z.number().parse(written),
            },
            { ...mode, supportedOptions: { temperature: options.temperature } },
            [],
            'C',
          ),
  };
  const check = fields[key];
  const reason = check === undefined ? null : check(value);
  if (reason !== null) {
    throw new SmartThingsCommandError(key, value, reason);
  }
}
function isCookingWrite(binding: Binding): boolean {
  const source = binding.sources[0];
  return (
    (source !== undefined && COOKING_CAPABILITIES.has(source.capability)) ||
    /raw:(samsungce\.)?(oven_operating_state|defined_recipe|cook_recipe):/.test(
      binding.capability.key,
    )
  );
}
function operationOf(binding: Binding, value: JsonValue): string | undefined {
  return binding.capability.key === 'raw:oven_operating_state.machine_state' && value === 'stop'
    ? 'stop'
    : OPERATIONS[binding.capability.key];
}
function requireReadiness(
  key: string,
  value: JsonValue,
  status: ComponentStatus,
  operation: string | undefined,
): void {
  const remote = attributeValue(status, 'remoteControlStatus', 'remoteControlEnabled');
  const readiness =
    operation === 'stop' || operation === 'pause'
      ? remote === 'true'
        ? null
        : 'Enable remote control on the microwave.'
      : microwaveReadiness(flatValues(status));
  if (readiness !== null) {
    throw new SmartThingsCommandError(key, value, readiness);
  }
}
function validateMode(key: string, value: JsonValue, status: ComponentStatus): void {
  const supported = z
    .array(z.string())
    .parse(attributeValue(status, 'samsungce.ovenMode', 'supportedOvenModes'));
  if (!supported.includes(z.string().parse(value))) {
    throw new SmartThingsCommandError(key, value, 'unsupported cooking mode');
  }
}
export function validateMicrowaveWrite(
  binding: Binding,
  status: ComponentStatus,
  value: JsonValue,
): void {
  if (
    attributeValue(status, 'samsungce.kitchenDeviceIdentification', 'type') !== 'microwave' ||
    !isCookingWrite(binding)
  ) {
    return;
  }
  const key = binding.capability.key;
  const operation = operationOf(binding, value);
  requireReadiness(key, value, status, operation);
  if (key === MICROWAVE_KEYS.mode) {
    validateMode(key, value, status);
    return;
  }
  if (key === 'raw:oven_operating_state:start') {
    validateGenericStart(value, status);
    return;
  }
  if (operation === 'start' && !modeOf(status).supportedOperations.includes('start')) {
    throw new SmartThingsCommandError(key, value, 'this mode starts on the appliance');
  }
  if (operation !== undefined) {
    return;
  }
  valueCheck(key, value, status, modeOf(status));
}
const GENERIC_MODES: Readonly<Record<string, string>> = {
  Bake: 'Convection',
  Broil: 'Grill',
  MWplusGrill: 'MicroWaveGrill',
  MWplusConvection: 'MicroWaveConvection',
  Others: 'NoOperation',
};
function validateGenericStart(value: JsonValue, status: ComponentStatus): void {
  const given = z
    .strictObject({
      mode: z.string().optional(),
      time: z.number().int().nonnegative().optional(),
      setpoint: z.number().int().nonnegative().optional(),
    })
    .parse(value);
  const current = modeOf(status);
  const requested = given.mode === undefined ? current.mode : GENERIC_MODES[given.mode];
  const specification = MICROWAVE_SPECIFICATION.parse(
    attributeValue(status, 'samsungce.kitchenModeSpecification', 'specification'),
  );
  const mode = specification.single.find((entry) => entry.mode === requested);
  if (mode?.supportedOperations.includes('start') !== true) {
    throw new SmartThingsCommandError('start', value, 'the requested mode cannot start remotely');
  }
  if (given.time !== undefined) {
    valueCheck(
      MICROWAVE_KEYS.setDuration,
      { operationTime: microwaveDuration(given.time) },
      status,
      mode,
    );
  }
  if (given.setpoint !== undefined) {
    valueCheck(MICROWAVE_KEYS.temperature, given.setpoint, status, mode);
  }
}

export function validateMicrowaveLamp(
  binding: Binding,
  status: ComponentStatus,
  value: JsonValue,
): void {
  if (
    attributeValue(status, 'samsungce.kitchenDeviceIdentification', 'type') !== 'microwave' ||
    binding.capability.key !== 'raw:samsungce.lamp.brightness_level'
  ) {
    return;
  }
  const supported = z
    .array(z.string())
    .safeParse(attributeValue(status, 'samsungce.lamp', 'supportedBrightnessLevel'));
  if (!supported.success || !supported.data.includes(z.string().parse(value))) {
    throw new SmartThingsCommandError(
      binding.capability.key,
      value,
      'supported light settings have not been reported or do not include this setting',
    );
  }
}
