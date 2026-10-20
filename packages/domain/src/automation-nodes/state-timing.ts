import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';

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

const timingDebounce = defineNodeKind({
  id: 'timing.debounce',
  name: 'Settle first',
  category: 'state',
  icon: 'audio-waveform',
  class: 'control',
  description:
    'Waits for a quiet period. When another run reaches the node meanwhile, the older run ends quietly as superseded and only the newest continues.',
  inputs: [
    {
      name: 'quiet',
      type: DURATION,
      required: true,
      static: true,
      description: 'How long nothing else may arrive before the run continues.',
      summary: true,
    },
    KEY_INPUT,
  ],
  outputs: [],
  exits: ['next', 'superseded'],
  scopes: { required: [], optional: ['superseded'] },
  stateful: true,
  summary: 'Continue after {quiet} of quiet',
  keywords: ['debounce', 'burst', 'settle', 'quiet', 'latest'],
  access: 'member',
  tier: 'v1',
});

const timingRateLimit = defineNodeKind({
  id: 'timing.rate_limit',
  name: 'Rate limit',
  category: 'state',
  icon: 'gauge',
  class: 'control',
  description:
    'Lets at most a number of runs through per window. The others take the dropped exit, or wait for the next free slot when queueing.',
  inputs: [
    {
      name: 'max',
      type: { t: 'number', integer: true, min: 1 },
      required: true,
      static: true,
      description: 'How many runs may pass in one window.',
      summary: true,
    },
    {
      name: 'window',
      type: DURATION,
      required: true,
      static: true,
      description: 'The length of the window.',
      summary: true,
    },
    KEY_INPUT,
    {
      name: 'excess',
      type: choice([
        ['drop', 'Drop'],
        ['queue', 'Wait for a free slot'],
      ]),
      required: false,
      default: 'drop',
      static: true,
      description: 'What happens to a run over the limit.',
    },
  ],
  outputs: [
    {
      name: 'delay',
      type: DURATION,
      optional: true,
      description: 'How long a queued run waited.',
    },
  ],
  exits: ['pass', 'dropped'],
  scopes: { required: [], optional: ['dropped'] },
  stateful: true,
  summary: 'At most {max} per {window}',
  keywords: ['throttle', 'limit', 'rate', 'announcements', 'per minute'],
  access: 'member',
  tier: 'v1',
});

const timingQuietHours = defineNodeKind({
  id: 'timing.quiet_hours',
  name: 'Quiet hours',
  category: 'state',
  icon: 'moon-star',
  class: 'control',
  description:
    'Holds a run until a daily quiet window ends, or sends it out the held exit, unless its priority reaches the bypass level.',
  inputs: [
    {
      name: 'from',
      type: { t: 'timeOfDay' },
      required: true,
      static: true,
      description: 'When the quiet window starts.',
      summary: true,
    },
    {
      name: 'to',
      type: { t: 'timeOfDay' },
      required: true,
      static: true,
      description: 'When the quiet window ends.',
      summary: true,
    },
    {
      name: 'priority',
      type: INTEGER,
      required: false,
      default: 0,
      live: true,
      description: 'How urgent this run is.',
    },
    {
      name: 'bypass',
      type: INTEGER,
      required: false,
      static: true,
      description: 'Runs with at least this priority ignore the quiet window.',
    },
    {
      name: 'quiet',
      type: choice([
        ['wait', 'Wait until it ends'],
        ['skip', 'Take the held exit'],
      ]),
      required: false,
      default: 'wait',
      static: true,
      description: 'What a run does during the quiet window.',
    },
  ],
  outputs: [
    {
      name: 'heldFor',
      type: DURATION,
      optional: true,
      description: 'How long the run was held.',
    },
  ],
  exits: ['pass', 'held'],
  scopes: { required: [], optional: ['held'] },
  stateful: true,
  summary: 'Quiet from {from} to {to}',
  keywords: ['night', 'silent', 'do not disturb', 'sleep', 'speech'],
  access: 'member',
  tier: 'v1',
});

export const STATE_TIMING_KINDS: readonly NodeKind[] = [
  timingDebounce,
  timingRateLimit,
  timingQuietHours,
];
