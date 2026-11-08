import type { PLANNER_RRULE_WEEKDAYS } from '@smarteverything/domain';
import * as chrono from 'chrono-node';

export type RruleWeekday = (typeof PLANNER_RRULE_WEEKDAYS)[number];

export type RepeatFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Stripped<Found> {
  readonly rest: string;
  readonly found: Found;
}

export interface Markers {
  readonly priority: 1 | 2 | 3 | null;
  readonly hashes: readonly string[];
}

export interface RepeatToken {
  readonly freq: RepeatFrequency;
  readonly interval: number;
  readonly days: readonly RruleWeekday[];
}

export interface ClockTime {
  readonly hour: number;
  readonly minute: number;
}

export interface TimesToken {
  readonly times: readonly ClockTime[];
  readonly range: boolean;
}

export interface DateToken {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface DatedToken {
  readonly date: DateToken | null;
  readonly time: ClockTime | null;
  readonly end: ClockTime | null;
}

export const WEEK_ORDER: readonly RruleWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const PRIORITY = /(^|\s)!([1-3])(?=\s|$)/g;
const HASH = /(^|\s)#([\p{L}\p{N}_-]+)(?=[\s,.;]|$)/gu;

function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, ' ');
}

function priorityOf(digit: string | undefined): 1 | 2 | 3 | null {
  if (digit === '1') return 1;
  if (digit === '2') return 2;
  if (digit === '3') return 3;
  return null;
}

export function extractMarkers(text: string): Stripped<Markers> {
  const first = [...text.matchAll(PRIORITY)][0];
  const hashes = [...text.matchAll(HASH)].flatMap((match) =>
    match[2] === undefined ? [] : [match[2]],
  );
  return {
    rest: blank(blank(text, PRIORITY), HASH),
    found: { priority: priorityOf(first?.[2]), hashes },
  };
}

const DAY_WORD =
  'monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thu|friday|fri|saturday|sat|sunday|sun';

const WEEKDAY_OF_WORD: Readonly<Record<string, RruleWeekday>> = {
  mon: 'MO',
  tue: 'TU',
  wed: 'WE',
  thu: 'TH',
  fri: 'FR',
  sat: 'SA',
  sun: 'SU',
};

const UNIT_FREQUENCY: Readonly<Record<string, RepeatFrequency>> = {
  day: 'DAILY',
  daily: 'DAILY',
  week: 'WEEKLY',
  weekly: 'WEEKLY',
  month: 'MONTHLY',
  monthly: 'MONTHLY',
  year: 'YEARLY',
  yearly: 'YEARLY',
  annually: 'YEARLY',
};

const WEEKDAYS: readonly RruleWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];
const WEEKEND: readonly RruleWeekday[] = ['SA', 'SU'];

function sortedDays(days: readonly RruleWeekday[]): readonly RruleWeekday[] {
  return WEEK_ORDER.filter((day) => days.includes(day));
}

function daysOfList(list: string): readonly RruleWeekday[] {
  const days = [...list.toLowerCase().matchAll(new RegExp(DAY_WORD, 'g'))].flatMap((word) => {
    const day = WEEKDAY_OF_WORD[word[0].slice(0, 3)];
    return day === undefined ? [] : [day];
  });
  return sortedDays(days);
}

function unitRepeat(match: RegExpExecArray): RepeatToken {
  const unit = (match[3] ?? '').toLowerCase();
  const interval = match[1] === undefined ? Number(match[2] ?? 1) : 2;
  return { freq: UNIT_FREQUENCY[unit] ?? 'DAILY', interval, days: [] };
}

const REPEAT_RULES: readonly {
  readonly pattern: RegExp;
  readonly build: (match: RegExpExecArray) => RepeatToken;
}[] = [
  {
    pattern: new RegExp(
      String.raw`\b(?:every|each)\s+((?:${DAY_WORD})(?:(?:\s*,\s*|\s+and\s+|\s*&\s*|\s+)(?:${DAY_WORD}))*)\b`,
      'i',
    ),
    build: (match) => ({ freq: 'WEEKLY', interval: 1, days: daysOfList(match[1] ?? '') }),
  },
  {
    pattern: /\b(?:every|each)\s+(?:(other)\s+|(\d+)\s+)?(day|week|month|year)s?\b/i,
    build: unitRepeat,
  },
  {
    pattern: /\b(?:every\s+|each\s+)?(weekday|weekend)s\b|\b(?:every|each)\s+(weekday|weekend)\b/i,
    build: (match) => ({
      freq: 'WEEKLY',
      interval: 1,
      days: (match[1] ?? match[2] ?? '').toLowerCase() === 'weekday' ? WEEKDAYS : WEEKEND,
    }),
  },
  {
    pattern: /\b(daily|weekly|monthly|yearly|annually)\b/i,
    build: (match) => ({
      freq: UNIT_FREQUENCY[(match[1] ?? '').toLowerCase()] ?? 'DAILY',
      interval: 1,
      days: [],
    }),
  },
];

export function extractRepeat(text: string): Stripped<RepeatToken | null> {
  for (const rule of REPEAT_RULES) {
    const match = rule.pattern.exec(text);
    if (match !== null) {
      return { rest: text.replace(rule.pattern, ' '), found: rule.build(match) };
    }
  }
  return { rest: text, found: null };
}

const TIME = String.raw`(?<![\w:.])(?:(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]\.?m\.?)?|(?:1[0-2]|0?[1-9])\s*[ap]\.?m\.?|noon|midnight)(?![\w:])`;
const JOINER = String.raw`\s*(?:,|and|&|-|–|to|until|till)\s*`;
const TIME_GROUP = new RegExp(
  String.raw`(?:(?:\bat|\bfrom|@)\s*)?${TIME}(?:${JOINER}${TIME})*`,
  'gi',
);
const TIME_WORD = new RegExp(TIME, 'gi');
const RANGE_JOINER = /(?:^|\s)(?:to|until|till)(?:\s|$)|[-–]/i;

function clockOf(token: string): ClockTime | null {
  const lower = token.toLowerCase();
  if (lower === 'noon') return { hour: 12, minute: 0 };
  if (lower === 'midnight') return { hour: 0, minute: 0 };
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?$/.exec(lower);
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (match[3] === undefined) return { hour, minute };
  return { hour: (hour % 12) + (match[3] === 'p' ? 12 : 0), minute };
}

function clocksIn(group: string): readonly ClockTime[] {
  return [...group.matchAll(TIME_WORD)].flatMap((word) => {
    const clock = clockOf(word[0]);
    return clock === null ? [] : [clock];
  });
}

function minutesOf(time: ClockTime): number {
  return time.hour * 60 + time.minute;
}

function distinctSorted(times: readonly ClockTime[]): readonly ClockTime[] {
  const unique = new Map(times.map((time) => [minutesOf(time), time]));
  return [...unique.values()].sort((left, right) => minutesOf(left) - minutesOf(right));
}

export function extractTimes(text: string): Stripped<TimesToken> {
  const groups = [...text.matchAll(TIME_GROUP)];
  const times = groups.flatMap((group) => clocksIn(group[0]));
  const only = groups.length === 1 ? groups[0] : undefined;
  const range = only !== undefined && times.length === 2 && RANGE_JOINER.test(only[0]);
  return {
    rest: text.replace(TIME_GROUP, ' '),
    found: { times: range ? times : distinctSorted(times), range },
  };
}

function clockOfComponents(
  components: chrono.ParsedComponents | null | undefined,
): ClockTime | null {
  if (components?.isCertain('hour') !== true) return null;
  return { hour: components.get('hour') ?? 0, minute: components.get('minute') ?? 0 };
}

function dateOfComponents(components: chrono.ParsedComponents): DateToken | null {
  const year = components.get('year');
  const month = components.get('month');
  const day = components.get('day');
  return year === null || month === null || day === null ? null : { year, month, day };
}

export function extractDate(
  text: string,
  reference: { readonly now: Date; readonly timeZone: string },
): Stripped<DatedToken> {
  const hit = chrono.parse(
    text,
    { instant: reference.now, timezone: reference.timeZone },
    { forwardDate: true },
  )[0];
  if (hit === undefined) return { rest: text, found: { date: null, time: null, end: null } };
  return {
    rest: `${text.slice(0, hit.index)} ${text.slice(hit.index + hit.text.length)}`,
    found: {
      date: dateOfComponents(hit.start),
      time: clockOfComponents(hit.start),
      end: clockOfComponents(hit.end),
    },
  };
}

const EDGE_WORDS =
  /^(?:(?:on|at|by|due|from|until|till|and|every|each)\s+)+|(?:\s+(?:on|at|by|due|from|until|till|and|every|each))+$/i;

export function cleanTitle(text: string): string {
  const spaced = text.replace(/\s+/g, ' ').trim();
  return spaced
    .replace(EDGE_WORDS, '')
    .replace(/^[\s,;:.&-]+|[\s,;:&-]+$/g, '')
    .trim();
}
