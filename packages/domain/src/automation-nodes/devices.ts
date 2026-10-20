import type { FlowType } from '../automation-v3/types';
import type { PortValue } from '../automation-v3/port-value';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';

export const DEVICE_REF: FlowType = { t: 'ref', of: 'device' };
export const TARGET_REF: FlowType = { t: 'ref', of: 'target' };
const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const NUMBER: FlowType = { t: 'number' };
const ANY: FlowType = { t: 'any' };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };
const SKIPPED: FlowType = {
  t: 'list',
  of: { t: 'record', fields: { device: DEVICE_REF, reason: TEXT } },
};

const CONTROL_OPTIONS_SOURCE = 'device.controls';

export function controlInput(description: string): InputPortDecl {
  return {
    name: 'control',
    type: TEXT,
    required: false,
    default: 'power',
    static: true,
    description,
    summary: true,
    ui: { optionsFrom: CONTROL_OPTIONS_SOURCE },
  };
}

export function readsControl(
  ports: Readonly<Record<string, PortValue | undefined>>,
): readonly string[] {
  const control = ports['control'];
  if (control !== undefined && 'lit' in control && typeof control.lit === 'string') {
    return [`device:${control.lit}`];
  }
  return ['device'];
}

const OK: OutputPortDecl = { name: 'ok', type: BOOLEAN, description: 'Whether the change worked.' };
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
  description: 'Why the change failed.',
};

const SET_INPUTS: readonly InputPortDecl[] = [
  {
    name: 'target',
    type: TARGET_REF,
    required: true,
    description: 'Which device, devices, room or group, or a wired device or list of devices.',
    summary: true,
  },
  controlInput('Which control to change.'),
  {
    name: 'to',
    type: ANY,
    required: false,
    live: true,
    description: 'The value to set, typed by the control.',
    summary: true,
  },
  {
    name: 'by',
    type: NUMBER,
    required: false,
    live: true,
    description: 'Change by this amount instead of setting an absolute value.',
  },
  {
    name: 'percent',
    type: BOOLEAN,
    required: false,
    default: false,
    static: true,
    description: 'Read the value as a percentage of the control range.',
  },
  {
    name: 'transition',
    type: { t: 'duration' },
    required: false,
    static: true,
    description: 'Fade time, where the device supports it.',
  },
  {
    name: 'requireAll',
    type: BOOLEAN,
    required: false,
    default: false,
    static: true,
    description: 'Fail when any member is skipped, not only when nothing was sent.',
  },
];

const SET_OUTPUTS: readonly OutputPortDecl[] = [
  OK,
  SENT,
  SKIPPED_OUT,
  { name: 'value', type: ANY, optional: true, description: 'The value now set.' },
  ERROR_OUT,
];

const deviceSet = defineNodeKind({
  id: 'device.set',
  name: 'Change device',
  category: 'devices',
  icon: 'sliders-horizontal',
  class: 'effect',
  description:
    'Sets a control on a device, devices, a room or a group. Offline or unsupported members are skipped and reported.',
  inputs: SET_INPUTS,
  outputs: SET_OUTPUTS,
  exits: ['next'],
  effect: { retry: 'relative', budget: 'command' },
  summary: 'Set {control} of {target} to {to}',
  keywords: ['turn', 'switch', 'light', 'dim', 'set', 'control', 'on', 'off'],
  access: 'member',
  tier: 'v1',
});

const deviceSetTemporarily = defineNodeKind({
  id: 'device.set_temporarily',
  name: 'Change for a while',
  category: 'devices',
  icon: 'timer-off',
  class: 'effect',
  description:
    'Sets a control, runs the body, then puts the device back to its base value when the body ends, is cancelled or the hub restarts.',
  inputs: [
    ...SET_INPUTS,
    {
      name: 'duration',
      type: { t: 'duration' },
      required: false,
      static: true,
      description: 'Keep the change for this long.',
      summary: true,
    },
    {
      name: 'holdWhile',
      type: BOOLEAN,
      required: false,
      live: true,
      description: 'Keep the change while this stays true.',
    },
    {
      name: 'priority',
      type: { t: 'number', integer: true, min: -1000, max: 1000 },
      required: false,
      default: 0,
      static: true,
      description: 'Higher priority wins when changes overlap.',
    },
  ],
  outputs: SET_OUTPUTS,
  exits: ['next', 'ended'],
  scopes: { required: ['body'], optional: [] },
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Set {control} of {target} to {to} for {duration}',
  keywords: ['temporary', 'revert', 'restore', 'flash', 'while', 'for a while'],
  access: 'member',
  tier: 'v1',
});

export const NON_DURABLE_SCOPES: Readonly<Record<string, readonly string[]>> = {
  'device.set_temporarily': ['body'],
};

const deviceToggle = defineNodeKind({
  id: 'device.toggle',
  name: 'Toggle',
  category: 'devices',
  icon: 'toggle-left',
  class: 'effect',
  description: 'Flips a control between on and off. Never retried automatically.',
  inputs: [
    {
      name: 'target',
      type: TARGET_REF,
      required: true,
      description: 'Which device, devices, room or group, or a wired device or list of devices.',
      summary: true,
    },
    controlInput('Which control to flip.'),
  ],
  outputs: [
    OK,
    { name: 'value', type: ANY, optional: true, description: 'The value now set.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'relative', budget: 'command' },
  summary: 'Toggle {control} of {target}',
  keywords: ['flip', 'switch', 'on', 'off'],
  access: 'member',
  tier: 'v1',
});

const deviceOperation = defineNodeKind({
  id: 'device.operation',
  name: 'Device operation',
  category: 'devices',
  icon: 'cog',
  class: 'effect',
  description:
    'Runs a named device operation, the same registry the assistant uses to call operations.',
  inputs: [
    {
      name: 'operation',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which operation.',
      summary: true,
      ui: { optionsFrom: 'device.operations' },
    },
    {
      name: 'args',
      type: { t: 'record', values: ANY },
      required: false,
      live: true,
      description: 'Arguments for the operation.',
    },
  ],
  outputs: [
    { name: 'result', type: ANY, optional: true, description: 'What the operation returned.' },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects' },
  summary: 'Run {operation}',
  keywords: ['press', 'button', 'dock', 'operation', 'call'],
  access: 'member',
  tier: 'v1',
});

const sceneRun = defineNodeKind({
  id: 'scene.run',
  name: 'Run scene',
  category: 'devices',
  icon: 'clapperboard',
  class: 'effect',
  description: 'Applies a scene. Offline members are skipped and reported.',
  inputs: [
    {
      name: 'scene',
      type: { t: 'ref', of: 'scene' },
      required: true,
      description: 'Which scene.',
      summary: true,
    },
  ],
  outputs: [OK, SKIPPED_OUT, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Run scene {scene}',
  keywords: ['scene', 'movie', 'mood', 'apply'],
  access: 'member',
  tier: 'v1',
});

export const DEVICE_NODE_KINDS: readonly NodeKind[] = [
  deviceSet,
  deviceSetTemporarily,
  deviceToggle,
  deviceOperation,
  sceneRun,
];
