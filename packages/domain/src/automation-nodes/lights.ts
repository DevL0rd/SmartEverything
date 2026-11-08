import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const COLOUR: FlowType = { t: 'color' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };

export const LIGHT_POWER_CHOICES = [
  { id: 'on', label: 'Turn on' },
  { id: 'off', label: 'Turn off' },
  { id: 'keep', label: 'Leave as it is' },
] as const;

export const LIGHT_BRIGHTNESS_RANGE = { min: 0, max: 100 } as const;

const POWER: FlowType = { t: 'choice', options: [...LIGHT_POWER_CHOICES] };
const BRIGHTNESS: FlowType = {
  t: 'number',
  min: LIGHT_BRIGHTNESS_RANGE.min,
  max: LIGHT_BRIGHTNESS_RANGE.max,
  unit: '%',
};
const KELVIN: FlowType = { t: 'number', integer: true, min: 1, unit: 'K' };

const LIGHT_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'target',
    type: TARGET_REF,
    required: true,
    description: 'Which light, lights, room or group, or a wired device or list of devices.',
    summary: true,
  },
  {
    name: 'power',
    type: POWER,
    required: false,
    default: 'keep',
    static: true,
    description: 'Turn the lights on or off, or leave their power as it is.',
    ui: { label: 'Power' },
  },
  {
    name: 'brightness',
    type: BRIGHTNESS,
    required: false,
    live: true,
    description: 'How bright, as a percentage of what each light can do.',
    summary: true,
    ui: {
      label: 'Brightness',
      min: LIGHT_BRIGHTNESS_RANGE.min,
      max: LIGHT_BRIGHTNESS_RANGE.max,
      step: 1,
      unit: '%',
    },
  },
  {
    name: 'color',
    type: COLOUR,
    required: false,
    live: true,
    description: 'A colour. Cannot be combined with a colour temperature.',
    ui: { label: 'Colour', editor: 'colour' },
  },
  {
    name: 'colorTemperature',
    type: KELVIN,
    required: false,
    live: true,
    description: 'How warm or cool the white is, in kelvin. Cannot be combined with a colour.',
    ui: { label: 'White', editor: 'kelvin', unit: 'K' },
  },
  {
    name: 'effect',
    type: TEXT,
    required: false,
    static: true,
    description: 'A light effect the lights offer.',
    ui: { label: 'Effect', optionsFrom: 'light.effects' },
  },
  {
    name: 'transition',
    type: { t: 'duration' },
    required: false,
    static: true,
    description: 'Fade time, done by the lights themselves where they support it.',
    ui: { label: 'Fade over' },
  },
];

const LIGHT_OUTPUTS: readonly OutputPortDecl[] = [
  { name: 'sent', type: DEVICE_LIST, description: 'Lights the command was sent to.' },
  {
    name: 'skipped',
    type: { t: 'list', of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } } },
    description: 'Lights left out, each with the reason (offline or not a light).',
  },
  ERROR_OUT,
];

const lightSet = defineNodeKind({
  id: 'light.set',
  name: 'Set lights',
  category: 'devices',
  icon: 'bulb',
  class: 'effect',
  description:
    'Changes power, brightness, colour or white, effect and fade on many lights at once. Each light gets one command with everything in it, sent to all lights together.',
  inputs: LIGHT_INPUTS,
  outputs: LIGHT_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command', mode: 'fire_and_forget' },
  summary: 'Set lights {target} to {brightness}',
  keywords: [
    'light',
    'lights',
    'lamp',
    'bulb',
    'dim',
    'brightness',
    'colour',
    'color',
    'warm',
    'cool',
    'white',
    'kelvin',
    'fade',
    'effect',
    'all lights',
    'room',
  ],
  access: 'member',
  tier: 'v1.1',
});

export const LIGHT_KINDS: readonly NodeKind[] = [lightSet];
