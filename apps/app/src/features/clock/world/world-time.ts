import { localClock } from '@smarteverything/domain';
import { localDayKey, MINUTE_MS, shiftDay } from '../../../format/time';

export type DayWord = 'Yesterday' | 'Today' | 'Tomorrow';

const HOUR_MINUTES = 60;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function offsetMinutesAt(at: number, zone: string): number {
  const local = localClock(new Date(at), zone);
  const wall = Date.UTC(local.year, local.month - 1, local.day) + local.minuteOfDay * MINUTE_MS;
  return Math.round((wall - Math.floor(at / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
}

export function offsetText(minutes: number): string {
  if (minutes === 0) return 'Same time';
  const sign = minutes > 0 ? '+' : '-';
  const whole = Math.abs(minutes);
  const hours = Math.floor(whole / HOUR_MINUTES);
  const rest = whole % HOUR_MINUTES;
  return rest === 0 ? `${sign}${String(hours)} h` : `${sign}${String(hours)} h ${String(rest)} min`;
}

export function offsetToHomeOf(at: number, zone: string, homeZone: string): string {
  return offsetText(offsetMinutesAt(at, zone) - offsetMinutesAt(at, homeZone));
}

export function dayWordOf(at: number, zone: string, homeZone: string): DayWord {
  const here = localDayKey(at, homeZone);
  const there = localDayKey(at, zone);
  if (there === here) return 'Today';
  return there === shiftDay(here, 1) ? 'Tomorrow' : 'Yesterday';
}

class UnknownWeekday extends Error {
  constructor(weekday: number) {
    super(`A weekday is 0 to 6, got ${String(weekday)}.`);
  }
}

export function weekdayNameOf(at: number, zone: string): string {
  const weekday = localClock(new Date(at), zone).weekday;
  const name = WEEKDAY_NAMES[weekday];
  if (name === undefined) throw new UnknownWeekday(weekday);
  return name;
}
