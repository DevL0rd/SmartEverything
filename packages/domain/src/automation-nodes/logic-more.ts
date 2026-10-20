import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import {
  ANY,
  FLAG,
  INSTANT,
  INTEGER,
  WEEKDAY_OPTIONS,
  choice,
  input,
  option,
  output,
  wired,
} from './more-support';

const FLAGS: FlowType = { t: 'list', of: FLAG };
const WEEKDAYS: FlowType = choice(WEEKDAY_OPTIONS);

const SLOT: FlowType = {
  t: 'record',
  fields: {
    days: { t: 'list', of: WEEKDAYS },
    from: { t: 'timeOfDay' },
    to: { t: 'timeOfDay' },
  },
};

const DAY_TYPES = [
  ['weekday', 'a weekday (Monday to Friday)'],
  ['weekend', 'a weekend day (Saturday or Sunday)'],
  ['listed', 'one of the listed dates'],
] as const;

export const LOGIC_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'logic.xor',
    name: 'Exactly one',
    category: 'logic',
    icon: 'split-square-horizontal',
    class: 'pure',
    description: 'True when exactly one of the flags is true.',
    inputs: [input('flags', FLAGS, 'The flags to look at.')],
    outputs: [output('result', FLAG, 'Whether exactly one flag is true.')],
    exits: [],
    summary: 'Exactly one of {flags}',
    keywords: ['xor', 'either', 'exclusive', 'one of', 'boolean'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'logic.count_true',
    name: 'At least N',
    category: 'logic',
    icon: 'list-todo',
    class: 'pure',
    description:
      'Counts the true flags and tells whether the count is at least a number and, if set, at most another.',
    inputs: [
      input('flags', FLAGS, 'The flags to count.'),
      option('atLeast', INTEGER, 'The fewest true flags that pass.', {
        default: 1,
        summary: true,
      }),
      option('atMost', { t: 'optional', of: INTEGER }, 'The most true flags that pass.'),
    ],
    outputs: [
      output('result', FLAG, 'Whether the count is within the limits.'),
      output('count', INTEGER, 'How many flags are true.'),
    ],
    exits: [],
    summary: 'At least {atLeast} of {flags}',
    keywords: ['count', 'majority', 'how many', 'doors', 'windows', 'threshold'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'logic.changed',
    name: 'Changed since last run',
    category: 'logic',
    icon: 'diff',
    class: 'read',
    description:
      'Tells whether a value differs from the value this node saw the last time it ran in this automation. The first run counts as changed and has no previous value.',
    inputs: [input('value', ANY, 'The value to compare with the one seen last time.')],
    outputs: [
      output('changed', FLAG, 'Whether the value differs from the last run.'),
      output('previous', ANY, 'The value seen the last time.', true),
    ],
    exits: [],
    summary: '{value} changed since last run',
    keywords: ['change', 'different', 'previous', 'last', 'edge', 'memory'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'logic.day_type',
    name: 'Day type',
    category: 'logic',
    icon: 'calendar-check',
    class: 'pure',
    description:
      'Tells whether a day is a weekday, a weekend day or one of the dates you list (public holidays, trips). Days are read in the home time zone; no holiday calendar is built in.',
    inputs: [
      wired('date', INSTANT, 'The moment whose day to test; now when empty.'),
      option(
        'is',
        choice(DAY_TYPES.map(([id, label]) => [id, label] as const)),
        'Which kind of day to test for.',
        {
          default: 'weekend',
          summary: true,
        },
      ),
      option('dates', { t: 'list', of: { t: 'date' } }, 'The listed dates, as YYYY-MM-DD.', {
        default: [],
      }),
    ],
    outputs: [output('result', FLAG, 'Whether the day is of the chosen type.')],
    exits: [],
    summary: 'Today is {is}',
    keywords: ['weekend', 'weekday', 'holiday', 'workday', 'day', 'calendar'],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'logic.in_schedule',
    name: 'In schedule',
    category: 'logic',
    icon: 'calendar-range',
    class: 'pure',
    description:
      'Tells whether a moment falls inside any of the weekly time slots. A slot lists its days (every day when empty) and a start and end; a slot that ends after midnight belongs to the day it starts on.',
    inputs: [
      wired('at', INSTANT, 'The moment to test; now when empty.'),
      input('slots', { t: 'list', of: SLOT }, 'The weekly slots.', { static: true, summary: true }),
    ],
    outputs: [
      output('result', FLAG, 'Whether the moment is inside a slot.'),
      output('slot', INTEGER, 'The position of the first slot that holds, from 0.', true),
    ],
    exits: [],
    summary: 'In schedule {slots}',
    keywords: ['schedule', 'slot', 'week', 'hours', 'timetable', 'quiet hours'],
    access: 'member',
    tier: 'v1.1',
  }),
];
