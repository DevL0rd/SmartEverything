import type { JsonValue } from '@smarteverything/domain';
import { CAPABILITY_DEFINITION, definitionKey } from '../src/definition-schema';
import { mapDevice } from '../src/device-mapping';
import { validateRawWrite } from '../src/raw-refinement';
import { DEVICE } from '../src/rest-schemas';

const TEXT = { type: 'string' } as const;
const SETTER_ATTRIBUTE = (setter: string): Record<string, unknown> => ({
  schema: { properties: { value: TEXT } },
  setter,
});
const READ_ATTRIBUTE = { schema: { properties: { value: TEXT } } } as const;

const DEFINITIONS = [
  {
    id: 'samsungce.kitchenDeviceIdentification',
    attributes: { type: READ_ATTRIBUTE },
  },
  {
    id: 'samsungce.ovenMode',
    attributes: {
      ovenMode: SETTER_ATTRIBUTE('setOvenMode'),
      supportedOvenModes: READ_ATTRIBUTE,
    },
    commands: { setOvenMode: { name: 'setOvenMode', arguments: [{ name: 'mode', schema: TEXT }] } },
  },
  {
    id: 'samsungce.ovenOperatingState',
    attributes: { operatingState: READ_ATTRIBUTE, ovenJobState: READ_ATTRIBUTE },
    commands: {
      start: { name: 'start' },
      pause: { name: 'pause' },
      stop: { name: 'stop' },
      setOperationTime: {
        name: 'setOperationTime',
        arguments: [{ name: 'operationTime', schema: TEXT }],
      },
    },
  },
  {
    id: 'samsungce.microwavePower',
    attributes: {
      powerLevel: SETTER_ATTRIBUTE('setPowerLevel'),
      supportedPowerLevels: READ_ATTRIBUTE,
    },
    commands: {
      setPowerLevel: { name: 'setPowerLevel', arguments: [{ name: 'level', schema: TEXT }] },
    },
  },
  {
    id: 'ovenSetpoint',
    attributes: { ovenSetpoint: SETTER_ATTRIBUTE('setOvenSetpoint') },
    commands: {
      setOvenSetpoint: {
        name: 'setOvenSetpoint',
        arguments: [{ name: 'setpoint', schema: { type: 'number' } }],
      },
    },
  },
  {
    id: 'ovenOperatingState',
    attributes: { machineState: SETTER_ATTRIBUTE('setMachineState') },
    commands: {
      setMachineState: { name: 'setMachineState', arguments: [{ name: 'state', schema: TEXT }] },
      start: {
        name: 'start',
        arguments: [
          { name: 'mode', optional: true, schema: TEXT },
          { name: 'time', optional: true, schema: { type: 'integer' } },
          { name: 'setpoint', optional: true, schema: { type: 'integer' } },
        ],
      },
      stop: { name: 'stop' },
    },
  },
  { id: 'samsungce.kitchenModeSpecification', attributes: { specification: READ_ATTRIBUTE } },
  { id: 'remoteControlStatus', attributes: { remoteControlEnabled: READ_ATTRIBUTE } },
  { id: 'samsungce.doorState', attributes: { doorState: READ_ATTRIBUTE } },
  { id: 'samsungce.kidsLock', attributes: { lockState: READ_ATTRIBUTE } },
  {
    id: 'samsungce.lamp',
    attributes: {
      brightnessLevel: SETTER_ATTRIBUTE('setBrightnessLevel'),
      supportedBrightnessLevel: READ_ATTRIBUTE,
    },
    commands: {
      setBrightnessLevel: {
        name: 'setBrightnessLevel',
        arguments: [{ name: 'level', schema: TEXT }],
      },
    },
  },
  {
    id: 'samsungce.definedRecipe',
    attributes: { definedRecipe: SETTER_ATTRIBUTE('setDefinedRecipe') },
    commands: {
      setDefinedRecipe: { name: 'setDefinedRecipe', arguments: [{ name: 'recipe', schema: TEXT }] },
      cookDefinedRecipe: {
        name: 'cookDefinedRecipe',
        arguments: [{ name: 'recipe', schema: TEXT }],
      },
    },
  },
  {
    id: 'samsungce.cookRecipe',
    commands: {
      setCookRecipe: { name: 'setCookRecipe', arguments: [{ name: 'recipe', schema: TEXT }] },
    },
  },
  {
    id: 'samsungce.softwareUpdate',
    attributes: { schedule: SETTER_ATTRIBUTE('setSchedule') },
    commands: {
      setSchedule: { name: 'setSchedule', arguments: [{ name: 'schedule', schema: TEXT }] },
      agreeUpdate: { name: 'agreeUpdate', arguments: [{ name: 'module', schema: TEXT }] },
    },
  },
];

const SPECIFICATION = {
  single: [
    {
      mode: 'MicroWave',
      supportedOperations: ['start', 'pause', 'stop'],
      supportedOptions: {
        operationTime: {
          min: '00:00:10',
          max: '01:30:00',
          default: '00:01:00',
          resolution: '00:00:10',
        },
        powerLevel: { default: '100%', supportedValues: ['100%', '50%'] },
      },
    },
    {
      mode: 'Convection',
      supportedOperations: ['start', 'stop'],
      supportedOptions: {
        operationTime: {
          min: '00:01:00',
          max: '01:30:00',
          default: '00:30:00',
          resolution: '00:01:00',
        },
        temperature: { C: { min: 100, max: 220, default: 160, resolution: 5 } },
      },
    },
    {
      mode: 'Grill',
      supportedOperations: ['stop'],
      supportedOptions: {
        temperature: { C: { min: 200, max: 250, default: 220, resolution: 10 } },
      },
    },
  ],
};

export interface MicrowaveState {
  readonly type: string;
  readonly mode: string;
  readonly remote: string;
  readonly door: string;
  readonly lock: string;
  readonly power: readonly string[] | null;
  readonly lamp: readonly string[] | null;
}

export const READY: MicrowaveState = {
  type: 'microwave',
  mode: 'MicroWave',
  remote: 'true',
  door: 'closed',
  lock: 'unlocked',
  power: ['100%', '50%'],
  lamp: ['off', 'high'],
};

function statusOf(state: MicrowaveState): Record<string, Record<string, unknown>> {
  const reported = (value: unknown): { value: unknown } => ({ value });
  const optional = (name: string, value: readonly string[] | null): Record<string, unknown> =>
    value === null ? {} : { [name]: reported(value) };
  return {
    'samsungce.kitchenDeviceIdentification': { type: reported(state.type) },
    'samsungce.ovenMode': {
      ovenMode: reported(state.mode),
      supportedOvenModes: reported(['MicroWave', 'Convection', 'Grill']),
    },
    'samsungce.ovenOperatingState': { operatingState: reported('ready') },
    'samsungce.microwavePower': {
      powerLevel: reported('100%'),
      ...optional('supportedPowerLevels', state.power),
    },
    ovenSetpoint: { ovenSetpoint: reported(0) },
    ovenOperatingState: { machineState: reported('ready') },
    'samsungce.kitchenModeSpecification': { specification: reported(SPECIFICATION) },
    remoteControlStatus: { remoteControlEnabled: reported(state.remote) },
    'samsungce.doorState': { doorState: reported(state.door) },
    'samsungce.kidsLock': { lockState: reported(state.lock) },
    'samsungce.lamp': {
      brightnessLevel: reported('off'),
      ...optional('supportedBrightnessLevel', state.lamp),
    },
    'samsungce.definedRecipe': { definedRecipe: reported(null) },
    'samsungce.softwareUpdate': { schedule: reported(null) },
  };
}

export function microwaveOf(
  state: MicrowaveState,
  model = 'TP1X_DA-KS-MICROWAVE-99999',
): ReturnType<typeof mapDevice> {
  const status = statusOf(state);
  const device = DEVICE.parse({
    deviceId: 'microwave-1',
    label: 'Microwave',
    manufacturerName: 'Samsung Electronics',
    locationId: 'location-1',
    ocf: { modelNumber: model },
    components: [
      {
        id: 'main',
        categories: [{ name: 'Microwave', categoryType: 'manufacturer' }],
        capabilities: [
          ...DEFINITIONS.map((definition) => ({
            id: definition.id,
            version: 1,
            status: status[definition.id] ?? {},
          })),
        ],
      },
    ],
  });
  const definitions = new Map(
    DEFINITIONS.map((definition) => [
      definitionKey(definition.id, 1),
      CAPABILITY_DEFINITION.parse({ ...definition, version: 1 }),
    ]),
  );
  return mapDevice(device, { rooms: new Map(), definitions });
}

export function writeAttempt(
  mapped: ReturnType<typeof microwaveOf>,
  key: string,
  value: JsonValue,
): unknown {
  const binding = mapped.bindings.find((entry) => entry.capability.key === key);
  const main = mapped.status['main'];
  if (binding === undefined || main === undefined || binding.write === null) {
    throw new Error(`no writable binding ${key}`);
  }
  validateRawWrite(binding, main, value);
  return binding.write(value);
}

export function bindingDescriptor(mapped: ReturnType<typeof microwaveOf>, key: string): unknown {
  return mapped.bindings.find((entry) => entry.capability.key === key)?.capability.value;
}
