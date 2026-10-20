import type { FlowType } from '../automation-v3/types';
import type { InputPortDecl, NodeKind, OutputPortDecl } from './define';
import { defineNodeKind } from './define';
import { SIGNED_MS } from './more-support';

const FLAG: FlowType = { t: 'boolean' };
const GENERIC: FlowType = { t: 'param', name: 'item' };

function choice(options: readonly (readonly [string, string])[]): FlowType {
  return {
    t: 'choice',
    options: options.map(([id, label]) => ({ id, label })),
  };
}

function option(
  name: string,
  type: FlowType,
  description: string,
  extra: Partial<InputPortDecl> = {},
): InputPortDecl {
  return { name, type, required: false, static: true, description, ...extra };
}

function input(name: string, type: FlowType, description: string, required = true): InputPortDecl {
  return { name, type, required, description };
}

function result(description: string): OutputPortDecl {
  return { name: 'result', type: FLAG, description };
}

const WEEKDAYS = choice([
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
]);

const compare = defineNodeKind({
  id: 'logic.compare',
  name: 'Compare',
  category: 'logic',
  icon: 'equal',
  class: 'pure',
  description: 'Compares two values of the same type.',
  inputs: [
    input('a', GENERIC, 'The left value.'),
    input('b', GENERIC, 'The right value.'),
    option(
      'op',
      choice([
        ['eq', 'is equal to'],
        ['ne', 'is not equal to'],
        ['gt', 'is greater than'],
        ['gte', 'is at least'],
        ['lt', 'is less than'],
        ['lte', 'is at most'],
      ]),
      'How to compare.',
      { default: 'eq', summary: true },
    ),
    option('ignoreCase', FLAG, 'Ignore upper and lower case when comparing text.', {
      default: false,
    }),
    option('tolerance', { t: 'number' }, 'Numbers closer than this count as equal.'),
    option('strict', FLAG, 'An absent left value fails the test instead of being false.', {
      default: false,
    }),
  ],
  outputs: [result('Whether the comparison holds.')],
  exits: [],
  summary: '{a} {op} {b}',
  keywords: ['equal', 'greater', 'less', 'above', 'below', 'test', 'if'],
  access: 'member',
  tier: 'v1',
});

const between = defineNodeKind({
  id: 'logic.between',
  name: 'Between',
  category: 'logic',
  icon: 'ruler',
  class: 'pure',
  description: 'Tells whether a number, instant, duration or time of day lies between two limits.',
  inputs: [
    input('value', GENERIC, 'The value to test.'),
    input('min', GENERIC, 'The lower limit.'),
    input('max', GENERIC, 'The upper limit.'),
    option('inclusive', FLAG, 'The limits themselves count as inside.', { default: true }),
  ],
  outputs: [result('Whether the value is between the limits.')],
  exits: [],
  summary: '{value} between {min} and {max}',
  keywords: ['range', 'within', 'inside', 'limits'],
  access: 'member',
  tier: 'v1',
});

const isOneOf = defineNodeKind({
  id: 'logic.in',
  name: 'Is one of',
  category: 'logic',
  icon: 'list-checks',
  class: 'pure',
  description: 'Tells whether a value is in a list.',
  inputs: [
    input('value', GENERIC, 'The value to look for.'),
    input('list', { t: 'list', of: GENERIC }, 'The allowed values.'),
    option('negate', FLAG, 'Tell whether the value is not in the list.', { default: false }),
  ],
  outputs: [result('Whether the value is in the list.')],
  exits: [],
  summary: '{value} is one of {list}',
  keywords: ['contains', 'member', 'any of', 'weather', 'list'],
  access: 'member',
  tier: 'v1',
});

function terms(description: string): readonly InputPortDecl[] {
  return [
    input('a', FLAG, `The first flag; ${description}.`),
    input('b', FLAG, 'The second flag.'),
    input('c', FLAG, 'A third flag, when needed.', false),
    input('d', FLAG, 'A fourth flag, when needed.', false),
  ];
}

const and = defineNodeKind({
  id: 'logic.and',
  name: 'And',
  category: 'logic',
  icon: 'ampersand',
  class: 'pure',
  description:
    'True when every wired flag is true. Wire two to four flags into a, b, c and d; it stops at the first false one.',
  inputs: terms('every flag must be true'),
  outputs: [result('True when all flags are true.')],
  exits: [],
  summary: '{a} and {b}',
  keywords: ['all', 'both', 'every', 'boolean'],
  access: 'member',
  tier: 'v1',
});

const or = defineNodeKind({
  id: 'logic.or',
  name: 'Or',
  category: 'logic',
  icon: 'circle-dot-dashed',
  class: 'pure',
  description:
    'True when any wired flag is true. Wire two to four flags into a, b, c and d; it stops at the first true one.',
  inputs: terms('one true flag is enough'),
  outputs: [result('True when at least one flag is true.')],
  exits: [],
  summary: '{a} or {b}',
  keywords: ['any', 'either', 'one of', 'boolean'],
  access: 'member',
  tier: 'v1',
});

const not = defineNodeKind({
  id: 'logic.not',
  name: 'Not',
  category: 'logic',
  icon: 'ban',
  class: 'pure',
  description: 'Turns true into false and false into true.',
  inputs: [input('flag', FLAG, 'The flag to turn around.')],
  outputs: [result('The opposite flag.')],
  exits: [],
  summary: 'Not {flag}',
  keywords: ['invert', 'opposite', 'negate', 'boolean'],
  access: 'member',
  tier: 'v1',
});

const exists = defineNodeKind({
  id: 'logic.exists',
  name: 'Has a value',
  category: 'logic',
  icon: 'circle-question-mark',
  class: 'pure',
  description: 'Tests whether a value is present, empty or missing.',
  inputs: [
    input('value', { t: 'optional', of: { t: 'any' } }, 'The value to test.', false),
    option(
      'test',
      choice([
        ['has_value', 'has a value'],
        ['is_empty', 'is empty'],
        ['is_null', 'is missing'],
      ]),
      'What to test.',
      { default: 'has_value', summary: true },
    ),
  ],
  outputs: [result('Whether the test holds.')],
  exits: [],
  summary: '{value} {test}',
  keywords: ['present', 'missing', 'empty', 'null', 'optional', 'defined'],
  access: 'member',
  tier: 'v1',
});

const coalesce = defineNodeKind({
  id: 'logic.coalesce',
  name: 'First available',
  category: 'logic',
  icon: 'layers',
  class: 'pure',
  description:
    'Takes the first of a, b, c and d that has a value. Fails with NotFound when none has one and there is no fallback.',
  inputs: [
    input('a', { t: 'optional', of: GENERIC }, 'The first candidate.', false),
    input('b', { t: 'optional', of: GENERIC }, 'The second candidate.', false),
    input('c', { t: 'optional', of: GENERIC }, 'A third candidate.', false),
    input('d', { t: 'optional', of: GENERIC }, 'A fourth candidate.', false),
    option('default', GENERIC, 'Used when no candidate has a value.'),
    option('message', { t: 'text' }, 'The error message when no value is available.'),
  ],
  outputs: [{ name: 'value', type: GENERIC, description: 'The first present value.' }],
  exits: [],
  summary: 'First available of {a} and {b}',
  keywords: ['fallback', 'default', 'first', 'or else', 'unwrap', 'optional'],
  access: 'member',
  tier: 'v1',
});

const select = defineNodeKind({
  id: 'logic.select',
  name: 'Choose',
  category: 'logic',
  icon: 'signpost',
  class: 'pure',
  description:
    'Gives one of two values depending on a condition: then when it is true, else when it is false.',
  inputs: [
    input('condition', FLAG, 'The condition.'),
    input('whenTrue', GENERIC, 'The value when the condition is true (then).'),
    input('whenFalse', GENERIC, 'The value when the condition is false (else).'),
  ],
  outputs: [{ name: 'value', type: GENERIC, description: 'The chosen value.' }],
  exits: [],
  summary: '{whenTrue} if {condition}, else {whenFalse}',
  keywords: ['ternary', 'if', 'choose', 'either', 'then', 'else', 'pick'],
  access: 'member',
  tier: 'v1',
});

const timeWindow = defineNodeKind({
  id: 'logic.time_window',
  name: 'Time between',
  category: 'logic',
  icon: 'clock-3',
  class: 'pure',
  description:
    'Tells whether a moment falls between two times of day. The window may cross midnight.',
  inputs: [
    input(
      'at',
      { t: 'optional', of: { t: 'instant' } },
      'The moment to test. Now when absent.',
      false,
    ),
    option('after', { t: 'timeOfDay' }, 'Start of the window.', {
      required: true,
      summary: true,
    }),
    option('before', { t: 'timeOfDay' }, 'End of the window.', {
      required: true,
      summary: true,
    }),
    option('days', { t: 'list', of: WEEKDAYS }, 'Only on these days. Every day when empty.', {
      default: [],
    }),
  ],
  outputs: [result('Whether the moment is in the window.')],
  exits: [],
  summary: 'Between {after} and {before}',
  keywords: ['clock', 'hours', 'schedule', 'night', 'morning', 'time'],
  access: 'member',
  tier: 'v1',
});

const daylight = defineNodeKind({
  id: 'logic.daylight',
  name: 'Day or night',
  category: 'logic',
  icon: 'sun-moon',
  class: 'read',
  description: 'Tells whether it is day or night at home right now.',
  inputs: [
    option(
      'is',
      choice([
        ['day', 'day'],
        ['night', 'night'],
      ]),
      'Which one to test for.',
      { default: 'night', summary: true },
    ),
    option('sunriseOffset', SIGNED_MS, 'Shifts sunrise. Negative is earlier.', {
      default: 0,
    }),
    option('sunsetOffset', SIGNED_MS, 'Shifts sunset. Negative is earlier.', {
      default: 0,
    }),
  ],
  outputs: [result('Whether it is the chosen part of the day.')],
  exits: [],
  summary: 'It is {is}',
  keywords: ['sunrise', 'sunset', 'dark', 'light', 'sun', 'dusk', 'dawn'],
  reads: () => ['clock'],
  access: 'member',
  tier: 'v1',
});

const triggerIs = defineNodeKind({
  id: 'logic.trigger_is',
  name: 'Which trigger',
  category: 'logic',
  icon: 'crosshair',
  class: 'pure',
  description: 'Tells whether this run was started by a given trigger.',
  inputs: [
    option('source', { t: 'text' }, 'Id of the trigger node.', {
      required: true,
      summary: true,
    }),
  ],
  outputs: [result('Whether the run came from that trigger.')],
  exits: [],
  summary: 'Started by {source}',
  keywords: ['trigger', 'came from', 'started by', 'source'],
  access: 'member',
  tier: 'v1',
});

export const LOGIC_KINDS: readonly NodeKind[] = [
  compare,
  between,
  isOneOf,
  and,
  or,
  not,
  exists,
  coalesce,
  select,
  timeWindow,
  daylight,
  triggerIs,
];
