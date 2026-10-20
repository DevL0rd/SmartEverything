import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type NodeKind } from './define';
import { DEVICE_REF, TARGET_REF, controlInput, readsControl } from './devices';

const NUMBER: FlowType = { t: 'number' };
const BOOLEAN: FlowType = { t: 'boolean' };
const ANY: FlowType = { t: 'any' };
const INTEGER: FlowType = { t: 'number', integer: true };
const DEVICE_LIST: FlowType = { t: 'list', of: DEVICE_REF };

export const AGGREGATE_FUNCTIONS = [
  { id: 'any', label: 'Any' },
  { id: 'all', label: 'All' },
  { id: 'none', label: 'None' },
  { id: 'count', label: 'Count where' },
  { id: 'average', label: 'Average' },
  { id: 'min', label: 'Lowest' },
  { id: 'max', label: 'Highest' },
  { id: 'sum', label: 'Sum' },
  { id: 'latest', label: 'Latest changed' },
] as const;

const deviceGet = defineNodeKind({
  id: 'device.get',
  name: 'Device value',
  category: 'devices',
  icon: 'gauge',
  class: 'read',
  description:
    'Reads one control of a device: the temporary effect base value first, then the observed value, then the pending intended one.',
  inputs: [
    {
      name: 'device',
      type: DEVICE_REF,
      required: true,
      description: 'Which device.',
      summary: true,
    },
    controlInput('Which control to read.'),
  ],
  outputs: [
    {
      name: 'value',
      type: ANY,
      description: 'The current value, null while the control has none.',
    },
    {
      name: 'reading',
      type: ANY,
      optional: true,
      description:
        'The current value, left out while the control has none, so a missing value is told apart from a null one.',
    },
    {
      name: 'previous',
      type: ANY,
      optional: true,
      description: 'The value before the last change.',
    },
    {
      name: 'changedAt',
      type: { t: 'instant' },
      optional: true,
      description: 'When it last changed.',
    },
    {
      name: 'inStateFor',
      type: { t: 'duration' },
      optional: true,
      description: 'Time in the current state.',
    },
    { name: 'available', type: BOOLEAN, description: 'Whether the device is reachable.' },
  ],
  exits: [],
  summary: '{control} of {device}',
  keywords: ['state', 'status', 'brightness', 'temperature', 'read'],
  reads: readsControl,
  access: 'member',
  tier: 'v1',
});

const deviceAggregate = defineNodeKind({
  id: 'device.aggregate',
  name: 'Across devices',
  category: 'devices',
  icon: 'chart-no-axes-column',
  class: 'read',
  description:
    'Combines one control across many devices: any, all, none, a count, an average and more.',
  inputs: [
    {
      name: 'target',
      type: TARGET_REF,
      required: true,
      description: 'Which devices.',
      summary: true,
    },
    controlInput('Which control to combine.'),
    {
      name: 'fn',
      type: {
        t: 'choice',
        options: AGGREGATE_FUNCTIONS.map((fn) => ({ id: fn.id, label: fn.label })),
      },
      required: false,
      default: 'any',
      static: true,
      description: 'How to combine the values.',
      summary: true,
    },
    {
      name: 'matches',
      type: ANY,
      required: false,
      live: true,
      description: 'The value that counts as a match for any, all, none and count.',
    },
  ],
  outputs: [
    { name: 'value', type: ANY, description: 'The combined result.' },
    { name: 'count', type: INTEGER, description: 'How many devices matched.' },
    { name: 'matching', type: DEVICE_LIST, description: 'The devices that matched.' },
  ],
  exits: [],
  summary: '{fn} of {control} across {target}',
  keywords: ['any', 'all', 'none', 'average', 'count', 'every'],
  reads: readsControl,
  access: 'member',
  tier: 'v1',
});

const timingCooldown = defineNodeKind({
  id: 'timing.cooldown',
  name: 'At most once per',
  category: 'state',
  icon: 'snowflake',
  class: 'control',
  description:
    'Lets a run pass at most once per period, otherwise takes the blocked exit. Covers throttle and cooldown. Remembered across restarts.',
  inputs: [
    {
      name: 'period',
      type: { t: 'duration' },
      required: true,
      static: true,
      description: 'The shortest time between two passes.',
      summary: true,
    },
    {
      name: 'key',
      type: { t: 'text' },
      required: false,
      live: true,
      description: 'Count separately per key, such as a room or a device.',
    },
  ],
  outputs: [
    {
      name: 'remaining',
      type: { t: 'duration' },
      optional: true,
      description: 'Time left until the next pass, when blocked.',
    },
  ],
  exits: ['pass', 'blocked'],
  scopes: { required: [], optional: ['blocked'] },
  stateful: true,
  summary: 'At most once per {period}',
  keywords: ['throttle', 'cooldown', 'rate', 'limit', 'once', 'debounce'],
  access: 'member',
  tier: 'v1',
});

const timingHysteresis = defineNodeKind({
  id: 'timing.hysteresis',
  name: 'Two thresholds',
  category: 'state',
  icon: 'activity',
  class: 'control',
  description:
    'Turns high when the value reaches the high threshold and low when it reaches the low one; nothing changes in between. Remembered across restarts.',
  inputs: [
    {
      name: 'value',
      type: NUMBER,
      required: true,
      live: true,
      description: 'The value to watch.',
      summary: true,
    },
    {
      name: 'high',
      type: NUMBER,
      required: true,
      static: true,
      description: 'Switch to high at or above this.',
      summary: true,
    },
    {
      name: 'low',
      type: NUMBER,
      required: true,
      static: true,
      description: 'Switch to low at or below this.',
      summary: true,
    },
    {
      name: 'initial',
      type: BOOLEAN,
      required: false,
      default: false,
      static: true,
      description: 'The state before the first crossing.',
    },
  ],
  outputs: [
    { name: 'state', type: BOOLEAN, description: 'True while in the high state.' },
    { name: 'rose', type: BOOLEAN, description: 'True when this run crossed into high.' },
    { name: 'fell', type: BOOLEAN, description: 'True when this run crossed into low.' },
  ],
  exits: ['next'],
  stateful: true,
  summary: 'High at {high}, low at {low}',
  keywords: ['threshold', 'schmitt', 'band', 'boost', 'above', 'below'],
  access: 'member',
  tier: 'v1',
});

export const HISTORY_RANGES = [
  { id: 'last', label: 'Last stretch of time' },
  { id: 'between', label: 'Between two moments' },
] as const;

const stateHistory = defineNodeKind({
  id: 'state.history',
  name: 'History',
  category: 'state',
  icon: 'chart-line',
  class: 'read',
  description:
    'Reads past values of a device control: the points, average, lowest, highest, change, count and the time spent in a given state.',
  inputs: [
    {
      name: 'device',
      type: { t: 'ref', of: 'device' },
      required: true,
      description: 'Which device.',
      summary: true,
    },
    {
      name: 'control',
      type: { t: 'text' },
      required: false,
      default: 'power',
      static: true,
      description: 'Which control.',
      summary: true,
      ui: { optionsFrom: 'device.controls' },
    },
    {
      name: 'last',
      type: { t: 'duration' },
      required: false,
      static: true,
      description: 'Look back this far from now.',
      summary: true,
    },
    {
      name: 'from',
      type: { t: 'optional', of: { t: 'instant' } },
      required: false,
      live: true,
      description: 'Start of a fixed range.',
    },
    {
      name: 'to',
      type: { t: 'optional', of: { t: 'instant' } },
      required: false,
      live: true,
      description: 'End of a fixed range.',
    },
    {
      name: 'stateEquals',
      type: ANY,
      required: false,
      live: true,
      description: 'Count the time the control held this value.',
    },
  ],
  outputs: [
    {
      name: 'points',
      type: { t: 'list', of: { t: 'record', fields: { at: { t: 'instant' }, value: ANY } } },
      description: 'The recorded values with their times.',
    },
    { name: 'average', type: NUMBER, optional: true, description: 'Average of numeric values.' },
    { name: 'min', type: NUMBER, optional: true, description: 'Lowest numeric value.' },
    { name: 'max', type: NUMBER, optional: true, description: 'Highest numeric value.' },
    { name: 'change', type: NUMBER, optional: true, description: 'Last value minus first value.' },
    { name: 'count', type: { t: 'number', integer: true }, description: 'How many points.' },
    {
      name: 'timeIn',
      type: { t: 'duration' },
      optional: true,
      description: 'Time spent where the control equals stateEquals.',
    },
  ],
  exits: [],
  summary: 'History of {control} on {device} over {last}',
  keywords: ['history', 'past', 'average', 'hours', 'today', 'trend', 'how long'],
  reads: () => ['device:history'],
  access: 'member',
  tier: 'v1',
});

export const STATE_NODE_KINDS: readonly NodeKind[] = [
  timingCooldown,
  timingHysteresis,
  stateHistory,
  deviceGet,
  deviceAggregate,
];
