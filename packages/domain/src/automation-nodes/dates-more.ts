import type { NodeKind } from './define';
import { defineNodeKind } from './define';
import {
  INSTANT,
  SIGNED_MS,
  WEEKDAY_OPTIONS,
  choice,
  input,
  option,
  output,
  wired,
} from './more-support';

const KEYWORDS = ['date', 'time', 'clock'];
const ZONE_KEY = 'home:zone';
const CLOCK_KEY = 'clock:now';
const LOCATION_KEY = 'home:location';

const START_UNITS = [
  ['day', 'Day'],
  ['week', 'Week (Monday first)'],
  ['month', 'Month'],
  ['year', 'Year'],
] as const;

const SUN_OUTPUTS = [
  ['sunrise', 'The sun rises.'],
  ['sunset', 'The sun sets.'],
  ['dawn', 'Morning twilight begins.'],
  ['dusk', 'Evening twilight ends.'],
  ['solarNoon', 'The sun is highest.'],
  ['goldenHour', 'The evening golden hour begins.'],
] as const;

export const DATE_MORE_KINDS: readonly NodeKind[] = [
  defineNodeKind({
    id: 'date.start_of',
    name: 'Start or end of',
    category: 'time',
    icon: 'calendar-arrow-down',
    class: 'pure',
    description:
      'The first moment of the day, week (Monday), month or year around a moment, or its last millisecond, in the home time zone. Daylight saving changes are handled.',
    inputs: [
      input('instant', INSTANT, 'The moment.'),
      option('unit', choice(START_UNITS), 'Which part of the calendar.', {
        default: 'day',
        summary: true,
      }),
      option(
        'edge',
        choice([
          ['start', 'Start'],
          ['end', 'End'],
        ]),
        'Start or end of it.',
        { default: 'start', summary: true },
      ),
    ],
    outputs: [output('instant', INSTANT, 'The start or end.')],
    exits: [],
    summary: '{edge} of the {unit} of {instant}',
    keywords: [...KEYWORDS, 'start', 'end', 'midnight', 'beginning', 'month', 'week'],
    reads: () => [ZONE_KEY],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'date.next',
    name: 'Next occurrence',
    category: 'time',
    icon: 'calendar-arrow-up',
    class: 'pure',
    description:
      'The next moment a time of day comes round on one of the chosen weekdays (every day when none are chosen), after a starting moment. Daylight saving changes are handled.',
    inputs: [
      input('clock', { t: 'timeOfDay' }, 'The time of day.', { static: true, summary: true }),
      option(
        'days',
        { t: 'list', of: choice(WEEKDAY_OPTIONS) },
        'Only on these days. Every day when empty.',
        {
          default: [],
        },
      ),
      wired('after', INSTANT, 'Look for a moment after this one; now when empty.'),
    ],
    outputs: [output('instant', INSTANT, 'The next occurrence.')],
    exits: [],
    summary: 'Next {clock}',
    keywords: [...KEYWORDS, 'next', 'upcoming', 'weekday', 'occurrence', 'alarm'],
    reads: () => [ZONE_KEY, CLOCK_KEY],
    access: 'member',
    tier: 'v1.1',
  }),
  defineNodeKind({
    id: 'date.sun_times',
    name: 'Sun times',
    category: 'time',
    icon: 'sunset',
    class: 'read',
    description:
      'Sunrise, sunset, twilight, solar noon and the evening golden hour for a day at the home location. A time the sun does not reach that day (polar summer or winter) is absent. Fails with NotFound when no home location is set.',
    inputs: [
      wired('date', { t: 'date' }, 'The day as YYYY-MM-DD in the home zone; today when empty.'),
      option('offset', SIGNED_MS, 'Shifts every time. Negative is earlier.', {
        default: 0,
        ui: { unit: 'ms', step: 60_000 },
      }),
    ],
    outputs: SUN_OUTPUTS.map(([name, description]) => output(name, INSTANT, description, true)),
    exits: [],
    summary: 'Sun times',
    keywords: [...KEYWORDS, 'sun', 'sunrise', 'sunset', 'dawn', 'dusk', 'golden hour', 'noon'],
    reads: () => [CLOCK_KEY, ZONE_KEY, LOCATION_KEY],
    access: 'member',
    tier: 'v1.1',
  }),
];
