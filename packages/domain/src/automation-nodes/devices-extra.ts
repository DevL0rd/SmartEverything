import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { DEVICE_REF, TARGET_REF, controlInput } from './devices';

const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };
const ANY: FlowType = { t: 'any' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };
const SNAPSHOT: FlowType = { t: 'record', values: ANY };
const SKIPPED: FlowType = {
  t: 'list',
  of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } },
};

export const DEFAULT_SNAPSHOT_CONTROLS: readonly string[] = [
  'power',
  'brightness',
  'color',
  'color_temperature',
  'light_effect',
];

const OK: OutputPortDecl = { name: 'ok', type: BOOLEAN, description: 'Whether it worked.' };
const SENT: OutputPortDecl = {
  name: 'sent',
  type: DEVICE_LIST,
  description: 'Devices the command was sent to.',
};
const SKIPPED_OUT: OutputPortDecl = {
  name: 'skipped',
  type: SKIPPED,
  description: 'Devices left out, each with the reason (offline or not supported).',
};
const ERROR_OUT: OutputPortDecl = {
  name: 'error',
  type: { t: 'error' },
  optional: true,
  description: 'Why it failed.',
};

const TARGET_INPUT: InputPortDecl = {
  name: 'target',
  type: TARGET_REF,
  required: true,
  description: 'Which device, devices, room or group, or a wired device or list of devices.',
  summary: true,
};

const deviceEnsure = defineNodeKind({
  id: 'device.ensure',
  name: 'Make sure',
  category: 'devices',
  icon: 'badge-check',
  class: 'effect',
  description:
    'Sends a value, waits for the device to report it and sends again when it does not, for devices whose cloud drops commands.',
  inputs: [
    TARGET_INPUT,
    controlInput('Which control to set.'),
    {
      name: 'to',
      type: ANY,
      required: true,
      live: true,
      description: 'The value the device must report.',
      summary: true,
    },
    {
      name: 'tries',
      type: { t: 'number', integer: true, min: 1, max: 10 },
      required: false,
      default: 3,
      static: true,
      description: 'How many times to send before giving up.',
    },
    {
      name: 'verifyWithin',
      type: { t: 'duration' },
      required: false,
      default: 10000,
      static: true,
      description: 'How long to wait for the device to report the value after each send.',
    },
  ],
  outputs: [
    OK,
    {
      name: 'attempts',
      type: { t: 'number', integer: true },
      description: 'How many sends it took.',
    },
    SENT,
    SKIPPED_OUT,
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Make sure {control} of {target} is {to}',
  keywords: ['verify', 'confirm', 'retry', 'reliable', 'plug', 'unreliable'],
  access: 'member',
  tier: 'v1.1',
});

const deviceFade = defineNodeKind({
  id: 'device.fade',
  name: 'Fade',
  category: 'devices',
  icon: 'sunrise',
  class: 'effect',
  description:
    'Moves a number control from one level to another in small steps over a time, paced by the command budget. Cancelling stops at the current level.',
  inputs: [
    TARGET_INPUT,
    { ...controlInput('Which number control to fade.'), default: 'brightness' },
    {
      name: 'from',
      type: NUMBER,
      required: false,
      live: true,
      description: 'The level to start from; the current level when empty.',
    },
    {
      name: 'to',
      type: NUMBER,
      required: true,
      live: true,
      description: 'The level to end on.',
      summary: true,
    },
    {
      name: 'over',
      type: { t: 'duration' },
      required: true,
      description: 'How long the fade takes.',
      summary: true,
    },
    {
      name: 'curve',
      type: {
        t: 'choice',
        options: [
          { id: 'linear', label: 'Even' },
          { id: 'ease', label: 'Slow at both ends' },
        ],
      },
      required: false,
      default: 'linear',
      static: true,
      description: 'How the level moves over the time.',
    },
    {
      name: 'step',
      type: NUMBER,
      required: false,
      static: true,
      description: 'The smallest change between two commands.',
    },
  ],
  outputs: [
    OK,
    SENT,
    SKIPPED_OUT,
    { name: 'value', type: NUMBER, optional: true, description: 'The last level sent.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Fade {control} of {target} to {to} over {over}',
  keywords: ['dim', 'wake up', 'sunrise', 'gradual', 'ramp', 'slowly'],
  access: 'member',
  tier: 'v1.1',
});

const deviceSnapshot = defineNodeKind({
  id: 'device.snapshot',
  name: 'Remember state',
  category: 'devices',
  icon: 'camera',
  class: 'read',
  description:
    'Reads the chosen controls of every device in the target so a later Restore state can put them back.',
  inputs: [
    TARGET_INPUT,
    {
      name: 'controls',
      type: { t: 'list', of: TEXT },
      required: false,
      default: [...DEFAULT_SNAPSHOT_CONTROLS],
      static: true,
      description: 'Which controls to remember.',
    },
  ],
  outputs: [
    {
      name: 'snapshot',
      type: SNAPSHOT,
      description: 'The remembered values, by device and control.',
    },
  ],
  exits: [],
  summary: 'Remember {controls} of {target}',
  keywords: ['save', 'remember', 'before', 'capture', 'state'],
  reads: () => ['device'],
  access: 'member',
  tier: 'v1.1',
});

const deviceRestore = defineNodeKind({
  id: 'device.restore',
  name: 'Restore state',
  category: 'devices',
  icon: 'history',
  class: 'effect',
  description:
    'Puts devices back to the values a Remember state node read. Devices that are offline or no longer support a control are skipped and reported.',
  inputs: [
    {
      name: 'snapshot',
      type: SNAPSHOT,
      required: true,
      live: true,
      description: 'The remembered values.',
      summary: true,
    },
  ],
  outputs: [OK, SENT, SKIPPED_OUT, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Restore {snapshot}',
  keywords: ['restore', 'undo', 'back', 'after', 'previous'],
  access: 'member',
  tier: 'v1.1',
});

const deviceIrSend = defineNodeKind({
  id: 'device.ir_send',
  name: 'Send IR button',
  category: 'devices',
  icon: 'remote',
  class: 'effect',
  description: 'Presses a button of a learned infrared remote through its blaster.',
  inputs: [
    {
      name: 'remote',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which remote, by name or id.',
      summary: true,
      ui: { optionsFrom: 'ir.remotes' },
    },
    {
      name: 'button',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which button, such as Power or HDMI 2.',
      summary: true,
    },
  ],
  outputs: [OK, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'relative', budget: 'effects' },
  summary: 'Press {button} on {remote}',
  keywords: ['infrared', 'tv', 'remote', 'button', 'ir', 'hdmi', 'air conditioner'],
  access: 'member',
  tier: 'v1.1',
});

const sceneCapture = defineNodeKind({
  id: 'scene.capture',
  name: 'Save current look',
  category: 'devices',
  icon: 'aperture',
  class: 'effect',
  description:
    'Saves the current values of the target devices as a scene. A scene with the same name is replaced only when overwrite is on.',
  inputs: [
    TARGET_INPUT,
    {
      name: 'name',
      type: TEXT,
      required: true,
      live: true,
      description: 'The name of the scene.',
      summary: true,
    },
    {
      name: 'overwrite',
      type: BOOLEAN,
      required: false,
      default: false,
      static: true,
      description: 'Replace a scene that already has this name.',
    },
  ],
  outputs: [
    { name: 'scene', type: { t: 'ref', of: 'scene' }, optional: true, description: 'The scene.' },
    OK,
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Save {target} as scene {name}',
  keywords: ['scene', 'save', 'capture', 'look', 'mood'],
  access: 'member',
  tier: 'v1.1',
});

export const DEVICE_EXTRA_KINDS: readonly NodeKind[] = [
  deviceEnsure,
  deviceFade,
  deviceSnapshot,
  deviceRestore,
  deviceIrSend,
  sceneCapture,
];
