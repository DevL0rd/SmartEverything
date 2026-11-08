import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };

export const CLIMATE_POWER_CHOICES = [
  { id: 'on', label: 'Turn on' },
  { id: 'off', label: 'Turn off' },
  { id: 'keep', label: 'Leave as it is' },
] as const;

export const CLIMATE_TEMPERATURE_UNITS = [
  { id: 'c', label: '°C' },
  { id: 'f', label: '°F' },
] as const;

export type ClimateTemperatureUnit = (typeof CLIMATE_TEMPERATURE_UNITS)[number]['id'];

export const CLIMATE_CONTROLS = {
  power: ['power'],
  mode: ['hvac_mode', 'mode'],
  temperature: ['target_temperature'],
  fan: ['fan_mode'],
  fanSpeed: ['fan_speed'],
  swing: ['swing'],
  oscillation: ['oscillation'],
  offTimer: ['off_timer'],
} as const;

const CLIMATE_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'target',
    type: TARGET_REF,
    required: true,
    description:
      'Which air conditioner, heater, thermostat or fan, room or group, or a wired device or list of devices.',
    summary: true,
  },
  {
    name: 'power',
    type: { t: 'choice', options: [...CLIMATE_POWER_CHOICES] },
    required: false,
    default: 'keep',
    static: true,
    description: 'Turn the devices on or off, or leave their power as it is.',
    ui: { label: 'Power' },
  },
  {
    name: 'mode',
    type: TEXT,
    required: false,
    static: true,
    description: 'The mode the device offers, such as cool, heat, dry or auto.',
    summary: true,
    ui: { label: 'Mode', optionsFrom: 'climate.modes' },
  },
  {
    name: 'temperature',
    type: { t: 'number' },
    required: false,
    live: true,
    description:
      'The target temperature, in the unit chosen below. Converted to what each device uses.',
    summary: true,
    ui: { label: 'Target temperature', step: 0.5 },
  },
  {
    name: 'unit',
    type: { t: 'choice', options: [...CLIMATE_TEMPERATURE_UNITS] },
    required: false,
    default: 'c',
    static: true,
    description: 'The unit the target temperature is given in.',
    ui: { label: 'Unit' },
  },
  {
    name: 'fan',
    type: TEXT,
    required: false,
    static: true,
    description: 'The fan setting the device offers, such as low, high or auto.',
    ui: { label: 'Fan', optionsFrom: 'climate.fan_modes' },
  },
  {
    name: 'fanSpeed',
    type: { t: 'number' },
    required: false,
    live: true,
    description: 'A numbered fan speed, within the range the device offers.',
    ui: { label: 'Fan speed', step: 1 },
  },
  {
    name: 'swing',
    type: TEXT,
    required: false,
    static: true,
    description: 'The swing setting the device offers, such as vertical or horizontal.',
    ui: { label: 'Swing', optionsFrom: 'climate.swing_modes' },
  },
  {
    name: 'oscillation',
    type: { t: 'boolean' },
    required: false,
    static: true,
    description: 'Whether a fan sweeps from side to side.',
    ui: { label: 'Oscillate' },
  },
  {
    name: 'offTimer',
    type: { t: 'duration' },
    required: false,
    static: true,
    description: 'Turn the device off after this long. Zero cancels a timer.',
    ui: { label: 'Turn off in', editor: 'duration' },
  },
];

const CLIMATE_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'sent', type: DEVICE_LIST, description: 'Devices the command was sent to.' },
  {
    name: 'skipped',
    type: { t: 'list', of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } } },
    description:
      'Devices left out, each with the reason (offline, no such control or out of range).',
  },
  ERROR_OUT,
];

const climateSet = defineNodeKind({
  id: 'climate.set',
  name: 'Set climate',
  category: 'devices',
  icon: 'thermometer',
  class: 'effect',
  description:
    'Changes power, mode, target temperature, fan, swing and off timer on air conditioners, heaters, thermostats and fans, in a room, a group or a list. Each device gets one command with everything it supports in it, sent to all devices together. Settings a device does not have are left out for that device.',
  inputs: CLIMATE_INPUTS,
  outputs: CLIMATE_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set climate of {target} to {temperature}',
  keywords: [
    'climate',
    'air conditioner',
    'ac',
    'heater',
    'thermostat',
    'temperature',
    'cool',
    'heat',
    'fan',
    'swing',
    'oscillate',
    'timer',
    'warm',
    'degrees',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const CLIMATE_KINDS: readonly NodeKind[] = [climateSet];
