import type { FlowType } from '../automation-v3/types';
import { END_KINDS, TRY_SCOPE_OUTPUTS, WAIT_KINDS } from './flow-waits';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';

const FLAG: FlowType = { t: 'boolean' };
const TEXT: FlowType = { t: 'text' };
const DURATION: FlowType = { t: 'duration' };
const ITEM: FlowType = { t: 'param', name: 'item' };
const RESULT: FlowType = { t: 'param', name: 'result' };
const INDEX: FlowType = { t: 'number', integer: true, min: 0 };
const COUNT: FlowType = { t: 'number', integer: true, min: 0 };

const MILLISECONDS = { unit: 'ms', step: 1000, min: 0 } as const;

const LOOP_LIMIT: FlowType = {
  t: 'record',
  fields: {
    iterations: { t: 'optional', of: { t: 'number', integer: true, min: 1 } },
    time: { t: 'optional', of: DURATION },
    onLimit: {
      t: 'choice',
      options: [
        { id: 'fail', label: 'Fail the run' },
        { id: 'end', label: 'End the loop quietly' },
      ],
    },
    note: { t: 'optional', of: TEXT },
  },
};

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

function input(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: true, description, ...extra };
}

const POSITION = scopeOutput(
  'position',
  { t: 'number', integer: true, min: 1 },
  'The pass number, starting at 1.',
);

function scopeOutput(name: string, type: FlowType, description: string): OutputPortDecl {
  return { name, type, description };
}

export const GAP = option(
  'gap',
  DURATION,
  'Pause between passes. None after the loop has decided to finish.',
  {
    ui: MILLISECONDS,
  },
);

export const LIMIT = option(
  'limit',
  LOOP_LIMIT,
  'Stop the loop after this many passes or this much time. Empty means no limit.',
);

const LOOP_KEY = option(
  'target',
  TEXT,
  'The key of the loop to leave. The innermost loop when empty.',
);

const BODY = { required: ['body'], optional: [] } as const;

const flowIf = defineNodeKind({
  id: 'flow.if',
  name: 'If',
  category: 'flow',
  icon: 'split',
  class: 'control',
  description:
    'Runs the first branch whose condition is true, checking top to bottom. Runs else when none is.',
  inputs: [],
  outputs: [],
  exits: [],
  scopes: { required: [], optional: ['else'] },
  summary: 'If',
  keywords: ['condition', 'branch', 'else', 'otherwise', 'when'],
  access: 'member',
  tier: 'v1',
});

const flowSwitch = defineNodeKind({
  id: 'flow.switch',
  name: 'Switch',
  category: 'flow',
  icon: 'git-branch',
  class: 'control',
  description:
    'Runs the case that matches a value: a literal, one of a list, a range or a condition. Runs default when none does.',
  inputs: [
    input('subject', { t: 'param', name: 'subject' }, 'The value to match against the cases.', {
      summary: true,
    }),
    option(
      'mode',
      {
        t: 'choice',
        options: [
          { id: 'first', label: 'First match only' },
          { id: 'all', label: 'Every match' },
        ],
      },
      'Run the first matching case or every matching case.',
      { default: 'first' },
    ),
  ],
  outputs: [],
  exits: [],
  scopes: { required: [], optional: ['default'] },
  summary: 'Switch on {subject}',
  keywords: ['case', 'mode', 'match', 'choose', 'branch', 'default'],
  access: 'member',
  tier: 'v1',
});

const guard = defineNodeKind({
  id: 'flow.guard',
  name: 'Only continue if',
  category: 'flow',
  icon: 'shield-check',
  class: 'control',
  description:
    'Ends the current scope when the condition is false. At the top of the run it ends the run as succeeded.',
  inputs: [
    input('condition', FLAG, 'Continue only when this is true.', { summary: true }),
    option('quietly', FLAG, 'End without a note in the run history.', { default: true }),
  ],
  outputs: [],
  exits: [],
  summary: 'Only continue if {condition}',
  keywords: ['guard', 'only if', 'require', 'stop if', 'condition'],
  access: 'member',
  tier: 'v1',
});

const forEach = defineNodeKind({
  id: 'flow.for_each',
  name: 'For each',
  category: 'flow',
  icon: 'list-ordered',
  class: 'control',
  description:
    'Runs the body once for every item of a list, taken as a snapshot at the start. An empty list skips the body.',
  inputs: [
    input('items', { t: 'list', of: ITEM }, 'The list to go through.', { summary: true }),
    option(
      'concurrency',
      { t: 'number', integer: true, min: 1 },
      'How many items run at once. Any number, no upper limit.',
      {
        default: 1,
      },
    ),
    option('reverse', FLAG, 'Go from the last item to the first.', { default: false }),
    {
      name: 'collect',
      type: RESULT,
      required: false,
      live: true,
      description:
        'A value taken at the end of every pass that reaches the end, gathered into results.',
    },
  ],
  outputs: [
    {
      name: 'results',
      type: { t: 'list', of: RESULT },
      optional: true,
      description: 'The collected values in source order. Present only when collect is set.',
    },
  ],
  exits: [],
  scopes: BODY,
  summary: 'For each of {items}',
  keywords: ['loop', 'every', 'each', 'iterate', 'list', 'collect', 'parallel', 'reverse'],
  access: 'member',
  tier: 'v1',
});

const repeat = defineNodeKind({
  id: 'flow.repeat',
  name: 'Repeat N times',
  category: 'flow',
  icon: 'repeat',
  class: 'control',
  description:
    'Runs the body a number of times. The count is read once at the start. No limit on the count unless the node sets one.',
  inputs: [
    input('times', { t: 'number', integer: true, min: 0 }, 'How many times.', { summary: true }),
    GAP,
    LIMIT,
  ],
  outputs: [],
  exits: [],
  scopes: BODY,
  summary: 'Repeat {times} times',
  keywords: ['loop', 'times', 'flash', 'again', 'count'],
  access: 'member',
  tier: 'v1',
});

const forRange = defineNodeKind({
  id: 'flow.for_range',
  name: 'Count from to',
  category: 'flow',
  icon: 'list-ordered',
  class: 'control',
  description:
    'Runs the body for each number from a start to an end in steps. The bounds are read once. The step is not zero.',
  inputs: [
    input('from', { t: 'number' }, 'The first number.', { summary: true }),
    input('to', { t: 'number' }, 'The last number.', { summary: true }),
    {
      name: 'step',
      type: { t: 'number' },
      required: false,
      default: 1,
      description: 'The distance between numbers. Negative counts down.',
    },
  ],
  outputs: [],
  exits: [],
  scopes: BODY,
  summary: 'Count from {from} to {to}',
  keywords: ['loop', 'range', 'for', 'count', 'steps', 'dim'],
  access: 'member',
  tier: 'v1',
});

const whileLoop = defineNodeKind({
  id: 'flow.while',
  name: 'While',
  category: 'flow',
  icon: 'refresh-cw',
  class: 'control',
  description:
    'Runs the body while a condition is true. The condition is checked before the first pass and after each gap.',
  inputs: [
    {
      name: 'condition',
      type: FLAG,
      required: true,
      live: true,
      summary: true,
      description: 'Keep going while this is true.',
    },
    GAP,
    LIMIT,
  ],
  outputs: [],
  exits: [],
  scopes: BODY,
  summary: 'While {condition}',
  keywords: ['loop', 'while', 'as long as', 'poll', 'condition'],
  access: 'member',
  tier: 'v1',
});

const doUntil = defineNodeKind({
  id: 'flow.do_until',
  name: 'Do until',
  category: 'flow',
  icon: 'redo',
  class: 'control',
  description:
    'Runs the body at least once, then again until a condition is true. The condition is checked right after the body.',
  inputs: [
    {
      name: 'condition',
      type: FLAG,
      required: true,
      live: true,
      summary: true,
      description: 'Stop once this is true.',
    },
    GAP,
    LIMIT,
  ],
  outputs: [],
  exits: [],
  scopes: BODY,
  summary: 'Do until {condition}',
  keywords: ['loop', 'until', 'repeat until', 'poll', 'condition'],
  access: 'member',
  tier: 'v1',
});

const breakLoop = defineNodeKind({
  id: 'flow.break',
  name: 'Break',
  category: 'flow',
  icon: 'log-out',
  class: 'control',
  description: 'Leaves the innermost loop, or the named enclosing loop. Only valid inside a loop.',
  inputs: [LOOP_KEY],
  outputs: [],
  exits: [],
  summary: 'Leave the loop',
  keywords: ['exit loop', 'stop loop', 'leave', 'break'],
  access: 'member',
  tier: 'v1',
});

const continueLoop = defineNodeKind({
  id: 'flow.continue',
  name: 'Next item',
  category: 'flow',
  icon: 'skip-forward',
  class: 'control',
  description:
    'Ends the current pass of the innermost loop, or the named enclosing loop, and goes on.',
  inputs: [LOOP_KEY],
  outputs: [],
  exits: [],
  summary: 'Go to the next pass',
  keywords: ['skip', 'next', 'continue', 'loop'],
  access: 'member',
  tier: 'v1',
});

export const FLOW_SCOPE_OUTPUTS: Readonly<Record<string, readonly OutputPortDecl[]>> = {
  'flow.for_each': [
    scopeOutput('item', ITEM, 'The current item.'),
    scopeOutput('index', INDEX, 'The pass number, starting at 0.'),
    POSITION,
    scopeOutput('first', FLAG, 'Whether this is the first item.'),
    scopeOutput('last', FLAG, 'Whether this is the last item.'),
    scopeOutput('count', COUNT, 'How many items there are.'),
  ],
  'flow.repeat': [
    scopeOutput('index', INDEX, 'The pass number, starting at 0.'),
    POSITION,
    scopeOutput('first', FLAG, 'Whether this is the first pass.'),
    scopeOutput('last', FLAG, 'Whether this is the last pass.'),
    scopeOutput('count', COUNT, 'How many passes there are.'),
  ],
  'flow.for_range': [
    scopeOutput('value', { t: 'number' }, 'The current number.'),
    scopeOutput('index', INDEX, 'The pass number, starting at 0.'),
    POSITION,
  ],
  'flow.while': [scopeOutput('index', INDEX, 'The pass number, starting at 0.'), POSITION],
  'flow.do_until': [scopeOutput('index', INDEX, 'The pass number, starting at 0.'), POSITION],
  'flow.forever': [scopeOutput('index', INDEX, 'The pass number, starting at 0.'), POSITION],
  'flow.try': TRY_SCOPE_OUTPUTS,
  'timing.cooldown': [
    scopeOutput('remaining', { t: 'duration' }, 'Time left until the next pass.'),
  ],
};

export const FLOW_KINDS: readonly NodeKind[] = [
  flowIf,
  flowSwitch,
  guard,
  forEach,
  repeat,
  forRange,
  whileLoop,
  doUntil,
  breakLoop,
  continueLoop,
  ...WAIT_KINDS,
  ...END_KINDS,
];
