import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';
import { DEVICE_REF } from './devices';

const NUMBER: FlowType = { t: 'number' };
const BOOLEAN: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const DURATION: FlowType = { t: 'duration' };
const INTEGER: FlowType = { t: 'number', integer: true };

const KEY_INPUT: InputPortDecl = {
  name: 'key',
  type: TEXT,
  required: false,
  live: true,
  description: 'Count separately per key, such as a room or a device.',
};

function choice(options: readonly (readonly [string, string])[]): FlowType {
  return { t: 'choice', options: options.map(([id, label]) => ({ id, label })) };
}

const COUNTER_OPS = [
  ['increment', 'Count up'],
  ['decrement', 'Count down'],
  ['reset', 'Reset'],
  ['set', 'Set to'],
] as const;

const COUNTER_RESETS = [
  ['never', 'Never'],
  ['day', 'Every day'],
  ['week', 'Every week'],
  ['month', 'Every month'],
] as const;

const TIMER_OPS = [
  ['start', 'Start'],
  ['restart', 'Restart'],
  ['extend', 'Add time'],
  ['pause', 'Pause'],
  ['resume', 'Resume'],
  ['cancel', 'Cancel'],
] as const;

const COMPARE_PAST_MODES = [
  ['ago', 'A while ago'],
  ['yesterday', 'Same time yesterday'],
  ['last_week', 'Same weekday last week'],
] as const;

const stateCounter = defineNodeKind({
  id: 'state.counter',
  name: 'Counter',
  category: 'state',
  icon: 'tally-5',
  class: 'control',
  description:
    'Counts up or down and remembers the count. It can wrap, stop at limits, reset every day, week or month, or count only the events inside a recent window.',
  inputs: [
    {
      name: 'op',
      type: choice(COUNTER_OPS),
      required: false,
      default: 'increment',
      static: true,
      description: 'What to do with the count.',
      summary: true,
    },
    {
      name: 'step',
      type: NUMBER,
      required: false,
      default: 1,
      static: true,
      description: 'How much one count changes.',
    },
    {
      name: 'to',
      type: NUMBER,
      required: false,
      live: true,
      description: 'The value to set when the operation is Set to.',
    },
    { name: 'min', type: NUMBER, required: false, static: true, description: 'The lowest count.' },
    { name: 'max', type: NUMBER, required: false, static: true, description: 'The highest count.' },
    {
      name: 'wrap',
      type: BOOLEAN,
      required: false,
      default: false,
      static: true,
      description: 'Go round to the other limit instead of stopping.',
    },
    {
      name: 'resetEvery',
      type: choice(COUNTER_RESETS),
      required: false,
      default: 'never',
      static: true,
      description: 'Start again from the minimum at the start of each period.',
    },
    {
      name: 'window',
      type: DURATION,
      required: false,
      static: true,
      description: 'Count only the events inside this recent window.',
    },
    KEY_INPUT,
  ],
  outputs: [
    { name: 'value', type: NUMBER, description: 'The count now.' },
    { name: 'reachedMax', type: BOOLEAN, description: 'Whether the count is at its highest.' },
  ],
  exits: ['next'],
  stateful: true,
  summary: '{op} the counter',
  keywords: ['count', 'tally', 'times', 'increment', 'how many'],
  access: 'member',
  tier: 'v1',
});

const stateTimer = defineNodeKind({
  id: 'state.timer',
  name: 'Timer',
  category: 'state',
  icon: 'alarm-clock',
  class: 'control',
  description:
    'Starts, restarts, extends, pauses, resumes or cancels a timer that survives a restart. When it ends it fires the timer trigger of the same name.',
  inputs: [
    {
      name: 'op',
      type: choice(TIMER_OPS),
      required: false,
      default: 'start',
      static: true,
      description: 'What to do with the timer.',
      summary: true,
    },
    {
      name: 'name',
      type: TEXT,
      required: true,
      static: true,
      description: 'The name of the timer, shared by every automation of the home.',
      summary: true,
    },
    {
      name: 'duration',
      type: DURATION,
      required: false,
      live: true,
      description: 'How long to run, or how much time to add.',
    },
  ],
  outputs: [
    { name: 'remaining', type: DURATION, optional: true, description: 'Time left on the timer.' },
    { name: 'running', type: BOOLEAN, description: 'Whether the timer is counting down.' },
  ],
  exits: ['next'],
  stateful: true,
  summary: '{op} timer {name}',
  keywords: ['countdown', 'alarm', 'after', 'minutes', 'delay'],
  access: 'member',
  tier: 'v1',
});

const stateMachine = defineNodeKind({
  id: 'state.machine',
  name: 'Modes',
  category: 'state',
  icon: 'workflow',
  class: 'control',
  description:
    'Keeps one named state, such as a home mode, and moves it when an event allows a transition from the current state. An event with no transition changes nothing.',
  inputs: [
    {
      name: 'event',
      type: TEXT,
      required: true,
      live: true,
      description: 'What just happened.',
      summary: true,
    },
    {
      name: 'states',
      type: { t: 'list', of: TEXT },
      required: true,
      static: true,
      description: 'Every state the machine can be in.',
    },
    {
      name: 'initial',
      type: TEXT,
      required: true,
      static: true,
      description: 'The state before any event.',
    },
    {
      name: 'transitions',
      type: {
        t: 'list',
        of: {
          t: 'record',
          fields: {
            from: TEXT,
            event: TEXT,
            to: TEXT,
            guard: { t: 'optional', of: BOOLEAN },
          },
        },
      },
      required: true,
      live: true,
      description:
        'Each transition: the state it leaves (or * for any), the event, the state it enters and an optional guard that must be true.',
    },
  ],
  outputs: [
    { name: 'state', type: TEXT, description: 'The state now.' },
    { name: 'previous', type: TEXT, description: 'The state before this event.' },
    { name: 'changed', type: BOOLEAN, description: 'Whether this event moved the machine.' },
  ],
  exits: ['next'],
  stateful: true,
  summary: 'Mode machine on {event}',
  keywords: ['mode', 'state machine', 'home', 'away', 'night', 'guests'],
  access: 'member',
  tier: 'v1',
});

const stateWindowStats = defineNodeKind({
  id: 'state.window_stats',
  name: 'Recent statistics',
  category: 'state',
  icon: 'chart-area',
  class: 'read',
  description:
    'Average, lowest, highest, rate of change and count of a number control over a recent window.',
  inputs: [
    {
      name: 'device',
      type: DEVICE_REF,
      required: true,
      description: 'Which device.',
      summary: true,
    },
    {
      name: 'control',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which number control.',
      summary: true,
      ui: { optionsFrom: 'device.controls' },
    },
    {
      name: 'window',
      type: DURATION,
      required: true,
      static: true,
      description: 'How far back to look.',
      summary: true,
    },
  ],
  outputs: [
    { name: 'average', type: NUMBER, optional: true, description: 'Average value.' },
    { name: 'min', type: NUMBER, optional: true, description: 'Lowest value.' },
    { name: 'max', type: NUMBER, optional: true, description: 'Highest value.' },
    {
      name: 'rate',
      type: NUMBER,
      optional: true,
      description: 'Change per hour between the first and the last minute of the window.',
    },
    { name: 'count', type: INTEGER, description: 'How many values were recorded.' },
  ],
  exits: [],
  summary: '{control} of {device} over {window}',
  keywords: ['average', 'recent', 'minutes', 'power draw', 'rate', 'statistics'],
  reads: () => ['device:history'],
  access: 'member',
  tier: 'v1',
});

const stateComparePast = defineNodeKind({
  id: 'state.compare_past',
  name: 'Compared with before',
  category: 'state',
  icon: 'git-compare-arrows',
  class: 'read',
  description:
    'Reads a control now and as it was a while ago, at this time yesterday or at this time on the same weekday last week, and the change between them.',
  inputs: [
    {
      name: 'device',
      type: DEVICE_REF,
      required: true,
      description: 'Which device.',
      summary: true,
    },
    {
      name: 'control',
      type: TEXT,
      required: true,
      static: true,
      description: 'Which number control.',
      summary: true,
      ui: { optionsFrom: 'device.controls' },
    },
    {
      name: 'mode',
      type: choice(COMPARE_PAST_MODES),
      required: false,
      default: 'ago',
      static: true,
      description: 'Which earlier moment to compare with.',
    },
    {
      name: 'ago',
      type: DURATION,
      required: false,
      static: true,
      description: 'How long ago, for A while ago.',
    },
  ],
  outputs: [
    { name: 'current', type: NUMBER, description: 'The value now.' },
    {
      name: 'earlier',
      type: NUMBER,
      optional: true,
      description: 'The value at the earlier moment.',
    },
    { name: 'change', type: NUMBER, optional: true, description: 'Now minus then.' },
  ],
  exits: [],
  summary: '{control} of {device} compared with {mode}',
  keywords: ['warmer', 'colder', 'yesterday', 'earlier', 'compare', 'change'],
  reads: () => ['device:history'],
  access: 'member',
  tier: 'v1',
});

export const STATE_EXTRA_KINDS: readonly NodeKind[] = [
  stateCounter,
  stateTimer,
  stateMachine,
  stateWindowStats,
  stateComparePast,
];
