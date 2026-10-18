import {
  MICROWAVE_KEYS,
  MICROWAVE_OPERATION_TIME,
  MICROWAVE_SPECIFICATION,
  microwaveDuration,
  microwavePowerOptions,
  microwaveProgramError,
  microwaveReadiness,
  microwaveRemoteReason,
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
const COOKING_COMMANDS = /raw:(samsungce\.)?(oven_operating_state|defined_recipe|cook_recipe):/;
const GENERIC_START = 'raw:oven_operating_state:start';
const OPERATIONS: Readonly<Record<string, 'start' | 'pause' | 'stop'>> = {
  [MICROWAVE_KEYS.start]: 'start',
  [MICROWAVE_KEYS.pause]: 'pause',
  [MICROWAVE_KEYS.stop]: 'stop',
  'raw:oven_operating_state.machine_state': 'stop',
  'raw:oven_operating_state:stop': 'stop',
};
const GENERIC_MODES: Readonly<Record<string, string>> = {
  Bake: 'Convection',
  Broil: 'Grill',
  MWplusGrill: 'MicroWaveGrill',
  MWplusConvection: 'MicroWaveConvection',
  Others: 'NoOperation',
};
const GENERIC_START_ARGUMENTS = z.strictObject({
  mode: z.string().optional(),
  time: z.number().int().nonnegative().optional(),
  setpoint: z.number().int().nonnegative().optional(),
});

type FieldCheck = (value: JsonValue, mode: MicrowaveMode, status: ComponentStatus) => string | null;

function specificationOf(status: ComponentStatus): z.infer<typeof MICROWAVE_SPECIFICATION> {
  const parsed = MICROWAVE_SPECIFICATION.safeParse(
    attributeValue(status, 'samsungce.kitchenModeSpecification', 'specification'),
  );
  if (!parsed.success) {
    throw new SmartThingsCommandError(
      'cooking mode',
      null,
      'the microwave has not reported its cooking modes',
    );
  }
  return parsed.data;
}

function currentMode(status: ComponentStatus): MicrowaveMode {
  const name = attributeValue(status, 'samsungce.ovenMode', 'ovenMode');
  const mode = specificationOf(status).single.find((entry) => entry.mode === name);
  if (mode === undefined) {
    throw new SmartThingsCommandError(
      'cooking mode',
      name ?? null,
      'current mode has no specification',
    );
  }
  return mode;
}

function durationCheck(value: JsonValue, mode: MicrowaveMode): string | null {
  const time = mode.supportedOptions.operationTime;
  return time === undefined
    ? 'This mode does not support a duration.'
    : microwaveProgramError(
        {
          mode: mode.mode,
          duration: MICROWAVE_OPERATION_TIME.parse(value).operationTime,
          power: '',
          temperature: 0,
        },
        { ...mode, supportedOptions: { operationTime: time } },
        [],
        'C',
      );
}

function temperatureCheck(value: JsonValue, mode: MicrowaveMode): string | null {
  const temperature = mode.supportedOptions.temperature;
  return temperature === undefined
    ? 'This mode does not support temperature.'
    : microwaveProgramError(
        { mode: mode.mode, duration: '00:00:00', power: '', temperature: z.number().parse(value) },
        { ...mode, supportedOptions: { temperature } },
        [],
        'C',
      );
}

function powerCheck(value: JsonValue, mode: MicrowaveMode, status: ComponentStatus): string | null {
  const supported = attributeValue(status, 'samsungce.microwavePower', 'supportedPowerLevels');
  const options =
    supported === undefined
      ? (mode.supportedOptions.powerLevel?.supportedValues ?? [])
      : microwavePowerOptions(mode, supported);
  return options.includes(z.string().parse(value))
    ? null
    : 'This power is not supported by the current mode.';
}

const FIELD_CHECKS: Readonly<Record<string, FieldCheck>> = {
  [MICROWAVE_KEYS.setDuration]: durationCheck,
  [MICROWAVE_KEYS.temperature]: temperatureCheck,
  [MICROWAVE_KEYS.power]: powerCheck,
};

function isCookingWrite(binding: Binding): boolean {
  const source = binding.sources[0];
  return (
    (source !== undefined && COOKING_CAPABILITIES.has(source.capability)) ||
    COOKING_COMMANDS.test(binding.capability.key)
  );
}

function readinessOf(
  operation: 'start' | 'pause' | 'stop' | undefined,
  status: ComponentStatus,
): string | null {
  if (operation === 'stop' || operation === 'pause') {
    return microwaveRemoteReason({
      [MICROWAVE_KEYS.remote]: attributeValue(
        status,
        'remoteControlStatus',
        'remoteControlEnabled',
      ),
    });
  }
  return microwaveReadiness({
    [MICROWAVE_KEYS.remote]: attributeValue(status, 'remoteControlStatus', 'remoteControlEnabled'),
    [MICROWAVE_KEYS.door]: attributeValue(status, 'samsungce.doorState', 'doorState'),
    [MICROWAVE_KEYS.lock]: attributeValue(status, 'samsungce.kidsLock', 'lockState'),
  });
}

function checkGenericStart(value: JsonValue, status: ComponentStatus): void {
  const given = GENERIC_START_ARGUMENTS.parse(value);
  const requested = given.mode === undefined ? currentMode(status).mode : GENERIC_MODES[given.mode];
  const mode = specificationOf(status).single.find((entry) => entry.mode === requested);
  if (mode?.supportedOperations.includes('start') !== true) {
    throw new SmartThingsCommandError('start', value, 'the requested mode cannot start remotely');
  }
  const problem =
    (given.time === undefined
      ? null
      : durationCheck({ operationTime: microwaveDuration(given.time) }, mode)) ??
    (given.setpoint === undefined ? null : temperatureCheck(given.setpoint, mode));
  if (problem !== null) {
    throw new SmartThingsCommandError('start', value, problem);
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
  const operation = OPERATIONS[key];
  const check = FIELD_CHECKS[key];
  const unready = readinessOf(operation, status);
  if (unready !== null) {
    throw new SmartThingsCommandError(key, value, unready);
  }
  if (key === GENERIC_START) {
    checkGenericStart(value, status);
  } else if (operation === 'start') {
    if (!currentMode(status).supportedOperations.includes('start')) {
      throw new SmartThingsCommandError(key, value, 'this mode starts on the appliance');
    }
  } else if (check !== undefined) {
    const problem = check(value, currentMode(status), status);
    if (problem !== null) {
      throw new SmartThingsCommandError(key, value, problem);
    }
  }
}
