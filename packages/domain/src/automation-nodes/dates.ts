import type { FlowType } from '../automation-v3/types';
import type { NodeKind } from './define';
import { defineNodeKind } from './define';

const INSTANT: FlowType = { t: 'instant' };
const DURATION: FlowType = { t: 'duration' };
const TEXT: FlowType = { t: 'text' };
const FLAG: FlowType = { t: 'boolean' };
const INT: FlowType = { t: 'number', integer: true };

const ZONE_KEY = 'home:zone';
const CLOCK_KEY = 'clock:now';

interface Option {
  readonly id: string;
  readonly label: string;
}

const DAYS: Option[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'next', label: 'Next occurrence' },
];

const PRESETS: Option[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'time', label: 'Time only' },
  { id: 'date', label: 'Date only' },
  { id: 'relative', label: 'Relative' },
  { id: 'speakable', label: 'Speakable' },
  { id: 'pattern', label: 'Pattern' },
];

const UNITS: Option[] = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'hours', label: 'Hours' },
  { id: 'days', label: 'Days' },
];

const SHIFT_UNITS: Option[] = [
  { id: 'seconds', label: 'Seconds' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'hours', label: 'Hours' },
  { id: 'days', label: 'Days' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'months', label: 'Months' },
  { id: 'years', label: 'Years' },
];

const KEYWORDS = ['date', 'time', 'clock'];

export const DATE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'date.now',
    name: 'Now',
    category: 'time',
    icon: 'clock',
    class: 'read',
    description: 'The current moment, captured once for each time the node runs.',
    inputs: [],
    outputs: [{ name: 'at', type: INSTANT, description: 'The current moment.' }],
    exits: [],
    summary: 'The current time',
    keywords: [...KEYWORDS, 'now', 'current'],
    reads: () => [CLOCK_KEY],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.today_at',
    name: 'Today at',
    category: 'time',
    icon: 'clock-4',
    class: 'read',
    description:
      'A time of day as a moment in the home time zone. Daylight saving changes are handled.',
    inputs: [
      { name: 'clock', type: { t: 'timeOfDay' }, required: true, description: 'The time of day.' },
      {
        name: 'day',
        type: { t: 'choice', options: DAYS },
        required: false,
        default: 'today',
        static: true,
        description: 'Today, tomorrow, or the next time that clock time comes round.',
      },
    ],
    outputs: [{ name: 'at', type: INSTANT, description: 'The moment.' }],
    exits: [],
    summary: '{day} at {clock}',
    keywords: [...KEYWORDS, 'today', 'tomorrow', 'at'],
    reads: () => [CLOCK_KEY, ZONE_KEY],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.parse',
    name: 'Read date',
    category: 'time',
    icon: 'calendar-search',
    class: 'pure',
    description:
      'Turns text into a moment. ISO 8601 by default, or a pattern. Text that cannot be read fails with Invalid.',
    inputs: [
      { name: 'text', type: TEXT, required: true, description: 'The text to read.' },
      {
        name: 'format',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'A pattern; empty means ISO 8601.',
      },
      {
        name: 'zone',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'The time zone when the text has none; empty means the home zone.',
      },
    ],
    outputs: [
      { name: 'instant', type: INSTANT, description: 'The moment.' },
      { name: 'ok', type: FLAG, description: 'Whether the text could be read.' },
    ],
    exits: [],
    summary: 'Read a date from {text}',
    keywords: [...KEYWORDS, 'parse', 'read', 'iso'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.format',
    name: 'Write date',
    category: 'time',
    icon: 'calendar-fold',
    class: 'pure',
    description:
      'Turns a moment into text in the home time zone: short, long, time only, date only, relative ("in 5 minutes"), speakable, or a pattern.',
    inputs: [
      { name: 'instant', type: INSTANT, required: true, description: 'The moment to write.' },
      {
        name: 'preset',
        type: { t: 'choice', options: PRESETS },
        required: false,
        default: 'short',
        static: true,
        description: 'The style.',
      },
      {
        name: 'pattern',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'The pattern when the style is "pattern".',
      },
      {
        name: 'locale',
        type: { t: 'optional', of: TEXT },
        required: false,
        static: true,
        description: 'The language; empty means the home language.',
      },
    ],
    outputs: [{ name: 'text', type: TEXT, description: 'The text.' }],
    exits: [],
    summary: 'Write {instant} as {preset}',
    keywords: [...KEYWORDS, 'format', 'write', 'relative', 'speak'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.add',
    name: 'Shift time',
    category: 'time',
    icon: 'calendar-plus',
    class: 'pure',
    description:
      'Moves a moment forward or back. Days, weeks, months and years follow the calendar and daylight saving.',
    inputs: [
      { name: 'instant', type: INSTANT, required: true, description: 'The starting moment.' },
      { name: 'amount', type: INT, required: true, description: 'How many units.' },
      {
        name: 'unit',
        type: { t: 'choice', options: SHIFT_UNITS },
        required: false,
        default: 'days',
        static: true,
        description: 'The unit.',
      },
      {
        name: 'subtract',
        type: FLAG,
        required: false,
        default: false,
        static: true,
        description: 'Go back instead of forward.',
      },
    ],
    outputs: [{ name: 'instant', type: INSTANT, description: 'The new moment.' }],
    exits: [],
    summary: 'Shift {instant} by {amount} {unit}',
    keywords: [...KEYWORDS, 'add', 'shift', 'plus', 'minus', 'tomorrow'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.difference',
    name: 'Time between',
    category: 'time',
    icon: 'move-horizontal',
    class: 'pure',
    description: 'How long it is from one moment to another, as a duration and as a number.',
    inputs: [
      { name: 'from', type: INSTANT, required: true, description: 'The earlier moment.' },
      { name: 'to', type: INSTANT, required: true, description: 'The later moment.' },
      {
        name: 'unit',
        type: { t: 'choice', options: UNITS },
        required: false,
        default: 'minutes',
        static: true,
        description: 'The unit of the number.',
      },
      {
        name: 'absolute',
        type: FLAG,
        required: false,
        default: false,
        static: true,
        description: 'Ignore which moment is first.',
      },
    ],
    outputs: [
      { name: 'duration', type: DURATION, description: 'The time between.' },
      { name: 'amount', type: { t: 'number' }, description: 'The time between, in the unit.' },
    ],
    exits: [],
    summary: 'Time from {from} to {to}',
    keywords: [...KEYWORDS, 'difference', 'between', 'elapsed', 'since', 'until'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.part',
    name: 'Part of date',
    category: 'time',
    icon: 'calendar-cog',
    class: 'pure',
    description: 'Splits a moment into its parts in the home time zone. Weekday 0 is Sunday.',
    inputs: [{ name: 'instant', type: INSTANT, required: true, description: 'The moment.' }],
    outputs: [
      { name: 'year', type: INT, description: 'The year.' },
      {
        name: 'month',
        type: { t: 'number', integer: true, min: 1, max: 12 },
        description: 'Month 1 to 12.',
      },
      {
        name: 'day',
        type: { t: 'number', integer: true, min: 1, max: 31 },
        description: 'Day of the month.',
      },
      {
        name: 'weekday',
        type: { t: 'number', integer: true, min: 0, max: 6 },
        description: 'Weekday, 0 is Sunday.',
      },
      {
        name: 'hour',
        type: { t: 'number', integer: true, min: 0, max: 23 },
        description: 'Hour 0 to 23.',
      },
      {
        name: 'minute',
        type: { t: 'number', integer: true, min: 0, max: 59 },
        description: 'Minute 0 to 59.',
      },
      { name: 'dayOfYear', type: INT, description: 'Day of the year.' },
      { name: 'week', type: INT, description: 'Week of the year.' },
      { name: 'isWeekend', type: FLAG, description: 'Whether it is Saturday or Sunday.' },
      { name: 'clock', type: { t: 'timeOfDay' }, description: 'The time of day.' },
    ],
    exits: [],
    summary: 'Parts of {instant}',
    keywords: [...KEYWORDS, 'year', 'month', 'weekday', 'weekend', 'hour', 'minute'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.duration',
    name: 'Duration',
    category: 'time',
    icon: 'timer',
    class: 'pure',
    description:
      'Builds a duration from hours, minutes and seconds, or splits a duration into parts and total seconds. Negative parts fail with Invalid.',
    inputs: [
      {
        name: 'hours',
        type: { t: 'number', integer: true, min: 0 },
        required: false,
        default: 0,
        description: 'Hours.',
      },
      {
        name: 'minutes',
        type: { t: 'number', integer: true, min: 0 },
        required: false,
        default: 0,
        description: 'Minutes.',
      },
      {
        name: 'seconds',
        type: { t: 'number', min: 0 },
        required: false,
        default: 0,
        description: 'Seconds.',
      },
      {
        name: 'split',
        type: { t: 'optional', of: DURATION },
        required: false,
        description: 'A duration to split into parts instead of building one.',
      },
    ],
    outputs: [
      { name: 'duration', type: DURATION, description: 'The duration.' },
      { name: 'hours', type: INT, description: 'Whole hours.' },
      { name: 'minutes', type: INT, description: 'Whole minutes left over.' },
      { name: 'seconds', type: { t: 'number' }, description: 'Seconds left over.' },
      {
        name: 'totalSeconds',
        type: { t: 'number' },
        description: 'The whole duration in seconds.',
      },
    ],
    exits: [],
    summary: 'Duration of {hours} h {minutes} min {seconds} s',
    keywords: [...KEYWORDS, 'duration', 'length', 'span', 'minutes'],
    access: 'member',
    tier: 'v1',
  }),
  defineNodeKind({
    id: 'date.since',
    name: 'Time since',
    category: 'time',
    icon: 'history',
    class: 'read',
    description:
      'How long ago a moment was, or with "until" how long until a future moment. Read from the clock when the node runs.',
    inputs: [
      { name: 'instant', type: INSTANT, required: true, description: 'The moment.' },
      {
        name: 'until',
        type: FLAG,
        required: false,
        default: false,
        static: true,
        description: 'Measure the time until the moment instead of since it.',
      },
    ],
    outputs: [{ name: 'duration', type: DURATION, description: 'The time since (or until).' }],
    exits: [],
    summary: 'Time since {instant}',
    keywords: [...KEYWORDS, 'since', 'ago', 'until', 'elapsed', 'last'],
    reads: () => [CLOCK_KEY, ZONE_KEY],
    access: 'member',
    tier: 'v1',
  }),
];
