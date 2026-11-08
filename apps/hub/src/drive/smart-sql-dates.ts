import type { DriveDayRange } from '@smarteverything/domain';

const DAY_MS = 86_400_000;
const SECOND_MS = 1000;
const MONDAY_FIRST = 6;
const WEEK_DAYS = 7;
const MONTHS_IN_YEAR = 12;
const FIRST_MONTH = 1;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

export interface DayBounds {
  readonly startSeconds: number | null;
  readonly endSeconds: number | null;
}

interface Calendar {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function dayText(calendar: Calendar): string {
  return `${String(calendar.year).padStart(4, '0')}-${two(calendar.month)}-${two(calendar.day)}`;
}

function utcOf(calendar: Calendar): number {
  return Date.UTC(calendar.year, calendar.month - 1, calendar.day);
}

function calendarOfUtc(millis: number): Calendar {
  const date = new Date(millis);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function shiftDays(calendar: Calendar, days: number): Calendar {
  return calendarOfUtc(utcOf(calendar) + days * DAY_MS);
}

function parseDay(day: string): Calendar {
  const [year = '', month = '', date = ''] = day.split('-');
  return { year: Number(year), month: Number(month), day: Number(date) };
}

function formatterOf(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
}

function partsOf(timeZone: string, instantMs: number): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const part of formatterOf(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return parts;
}

function offsetMs(timeZone: string, instantMs: number): number {
  const parts = partsOf(timeZone, instantMs);
  const local = Date.UTC(
    parts['year'] ?? 0,
    (parts['month'] ?? 1) - 1,
    parts['day'] ?? 1,
    parts['hour'] ?? 0,
    parts['minute'] ?? 0,
    parts['second'] ?? 0,
  );
  return local - Math.floor(instantMs / SECOND_MS) * SECOND_MS;
}

export function dayStartSeconds(day: string, timeZone: string): number {
  const wall = utcOf(parseDay(day));
  const first = wall - offsetMs(timeZone, wall);
  const settled = wall - offsetMs(timeZone, first);
  return settled / SECOND_MS;
}

export function dayBounds(range: DriveDayRange, timeZone: string): DayBounds {
  return {
    startSeconds: range.from === null ? null : dayStartSeconds(range.from, timeZone),
    endSeconds:
      range.to === null
        ? null
        : dayStartSeconds(dayText(shiftDays(parseDay(range.to), 1)), timeZone),
  };
}

function today(now: Date, timeZone: string): Calendar {
  const parts = partsOf(timeZone, now.getTime());
  return { year: parts['year'] ?? 0, month: parts['month'] ?? 1, day: parts['day'] ?? 1 };
}

function spanOf(from: Calendar, to: Calendar): DriveDayRange {
  return { from: dayText(from), to: dayText(to) };
}

function monthSpan(year: number, month: number): DriveDayRange {
  const first = { year, month, day: 1 };
  const next =
    month === MONTHS_IN_YEAR
      ? { year: year + 1, month: 1, day: 1 }
      : { ...first, month: month + 1 };
  return spanOf(first, shiftDays(next, -1));
}

function yearSpan(year: number): DriveDayRange {
  return spanOf({ year, month: 1, day: 1 }, { year, month: MONTHS_IN_YEAR, day: 31 });
}

function weekSpan(current: Calendar, weeksBack: number): DriveDayRange {
  const weekday = new Date(utcOf(current)).getUTCDay();
  const sinceMonday = (weekday + MONDAY_FIRST) % WEEK_DAYS;
  const monday = shiftDays(current, -sinceMonday - weeksBack * WEEK_DAYS);
  return spanOf(monday, shiftDays(monday, WEEK_DAYS - 1));
}

function monthBack(current: Calendar, monthsBack: number): DriveDayRange {
  const index = current.year * MONTHS_IN_YEAR + (current.month - FIRST_MONTH) - monthsBack;
  return monthSpan(Math.floor(index / MONTHS_IN_YEAR), (index % MONTHS_IN_YEAR) + FIRST_MONTH);
}

function namedMonth(current: Calendar, month: number, strictlyBefore: boolean): DriveDayRange {
  const reached = strictlyBefore ? month < current.month : month <= current.month;
  return monthSpan(reached ? current.year : current.year - 1, month);
}

function relativeWord(word: string, current: Calendar): DriveDayRange | null {
  switch (word) {
    case 'today':
      return spanOf(current, current);
    case 'yesterday':
      return spanOf(shiftDays(current, -1), shiftDays(current, -1));
    case 'this week':
      return weekSpan(current, 0);
    case 'last week':
      return weekSpan(current, 1);
    case 'this month':
      return monthBack(current, 0);
    case 'last month':
      return monthBack(current, 1);
    case 'this year':
      return yearSpan(current.year);
    case 'last year':
      return yearSpan(current.year - 1);
    default:
      return null;
  }
}

function monthNumber(name: string): number | null {
  const index = MONTH_NAMES.findIndex((month) => month === name);
  return index < 0 ? null : index + 1;
}

function monthWord(word: string, current: Calendar): DriveDayRange | null {
  const [first = '', second = ''] = word.split(' ');
  const named = monthNumber(first);
  if (named !== null) {
    if (second === '') {
      return namedMonth(current, named, false);
    }
    return /^\d{4}$/.test(second) ? monthSpan(Number(second), named) : null;
  }
  const month = monthNumber(second);
  if (month === null || (first !== 'this' && first !== 'last')) {
    return null;
  }
  return namedMonth(current, month, first === 'last');
}

function validDay(calendar: Calendar): boolean {
  return dayText(calendarOfUtc(utcOf(calendar))) === dayText(calendar);
}

function isoWord(word: string): DriveDayRange | null {
  if (/^\d{4}$/.test(word)) {
    return yearSpan(Number(word));
  }
  const parts = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(word);
  if (parts === null) {
    return null;
  }
  const calendar = { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3] ?? 1) };
  if (!validDay(calendar)) {
    return null;
  }
  return parts[3] === undefined
    ? monthSpan(calendar.year, calendar.month)
    : spanOf(calendar, calendar);
}

export function resolveDateWord(word: string, now: Date, timeZone: string): DriveDayRange | null {
  const normal = word.trim().toLowerCase().replace(/\s+/g, ' ');
  const current = today(now, timeZone);
  return relativeWord(normal, current) ?? monthWord(normal, current) ?? isoWord(normal);
}
