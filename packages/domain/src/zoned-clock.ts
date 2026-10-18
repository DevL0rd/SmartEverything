import { z } from 'zod';
import type { CalendarDate } from './sun';

export interface LocalClock extends CalendarDate {
  readonly weekday: number;
  readonly minuteOfDay: number;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const CLOCK_PARTS = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int(),
  day: z.coerce.number().int(),
  hour: z.coerce.number().int(),
  minute: z.coerce.number().int(),
  weekday: z.enum(WEEKDAY_NAMES),
});

const clockFormats = new Map<string, Intl.DateTimeFormat>();

function clockFormat(timeZone: string): Intl.DateTimeFormat {
  const known = clockFormats.get(timeZone);
  if (known !== undefined) {
    return known;
  }
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  clockFormats.set(timeZone, made);
  return made;
}

export function localClock(instant: Date, timeZone: string): LocalClock {
  const parts = clockFormat(timeZone).formatToParts(instant);
  const clock = CLOCK_PARTS.parse(Object.fromEntries(parts.map((part) => [part.type, part.value])));
  return {
    year: clock.year,
    month: clock.month,
    day: clock.day,
    weekday: WEEKDAY_NAMES.indexOf(clock.weekday),
    minuteOfDay: clock.hour * 60 + clock.minute,
  };
}

function wallClockAsUtc(instant: number, timeZone: string): number {
  const clock = localClock(new Date(instant), timeZone);
  return Date.UTC(clock.year, clock.month - 1, clock.day, 0, clock.minuteOfDay);
}

export function zonedInstant(date: CalendarDate, minuteOfDay: number, timeZone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay);
  const firstGuess = naive - (wallClockAsUtc(naive, timeZone) - naive);
  return new Date(naive - (wallClockAsUtc(firstGuess, timeZone) - firstGuess));
}

export function minuteOfClock(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

export interface ClockWindow {
  readonly from: string;
  readonly to: string;
}

export function insideClockWindow(window: ClockWindow, minute: number): boolean {
  const from = minuteOfClock(window.from);
  const to = minuteOfClock(window.to);
  if (from === to) {
    return false;
  }
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

export function shiftedDate(
  date: CalendarDate,
  days: number,
): CalendarDate & { readonly weekday: number } {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}
