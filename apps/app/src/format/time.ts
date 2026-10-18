import { z } from 'zod';
import { zonedDateFormat } from './locale';
import { twoDigits } from './number';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const DAY_KEY = z.iso.date();

const DAY_PARTS = z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()]);

const CLOCK = zonedDateFormat({ hour: 'numeric', minute: '2-digit' });
const DAY_KEY_FORMAT = zonedDateFormat(
  { year: 'numeric', month: '2-digit', day: '2-digit' },
  'en-CA',
);
const DAY_NAME = zonedDateFormat({ weekday: 'short', day: 'numeric', month: 'short' });

export function clock(moment: Date | string | number, timeZone: string | null = null): string {
  return CLOCK(timeZone).format(new Date(moment));
}

function deviceDayKey(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    throw new RangeError(`Cannot name the day of an invalid date: ${String(at)}`);
  }
  return `${String(at.getFullYear()).padStart(4, '0')}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}`;
}

export function localDayKey(
  moment: Date | string | number,
  timeZone: string | null = null,
): string {
  const at = new Date(moment);
  return timeZone === null ? deviceDayKey(at) : DAY_KEY_FORMAT(timeZone).format(at);
}

interface DayKeys {
  readonly now: number;
  readonly timeZone: string | null;
  readonly today: string;
  readonly yesterday: string;
}

let dayKeys: DayKeys | null = null;

function dayKeysAt(now: number, timeZone: string | null): DayKeys {
  if (dayKeys?.now === now && dayKeys.timeZone === timeZone) {
    return dayKeys;
  }
  dayKeys = {
    now,
    timeZone,
    today: localDayKey(now, timeZone),
    yesterday: localDayKey(now - DAY_MS, timeZone),
  };
  return dayKeys;
}

export type DayRelation = 'today' | 'yesterday' | 'earlier';

export function dayRelationOf(
  moment: Date | string | number,
  now: number,
  timeZone: string | null = null,
): DayRelation {
  const days = dayKeysAt(now, timeZone);
  const key = localDayKey(moment, timeZone);
  if (key === days.today) {
    return 'today';
  }
  return key === days.yesterday ? 'yesterday' : 'earlier';
}

export function dayLabelOf(
  moment: Date | string | number,
  days: { readonly today: string; readonly yesterday: string },
  timeZone: string | null = null,
): string {
  const key = localDayKey(moment, timeZone);
  if (key === days.today) {
    return 'Today';
  }
  if (key === days.yesterday) {
    return 'Yesterday';
  }
  return DAY_NAME(timeZone).format(new Date(moment));
}

export function dayLabel(
  moment: Date | string | number,
  now: number,
  timeZone: string | null = null,
): string {
  return dayLabelOf(moment, dayKeysAt(now, timeZone), timeZone);
}

export function relative(moment: Date | string, now: number): string {
  const elapsed = Math.max(0, now - new Date(moment).getTime());
  if (elapsed < MINUTE_MS) {
    return 'just now';
  }
  if (elapsed < HOUR_MS) {
    return `${String(Math.floor(elapsed / MINUTE_MS))} min ago`;
  }
  if (elapsed < DAY_MS) {
    return `${String(Math.floor(elapsed / HOUR_MS))} h ago`;
  }
  return `${String(Math.floor(elapsed / DAY_MS))} d ago`;
}

export function moment(at: Date | string, now: number, timeZone: string | null = null): string {
  const day = dayLabel(at, now, timeZone);
  return `${day === 'Today' ? 'today' : day} ${clock(at, timeZone)}`;
}

const DURATION_UNITS = [
  { seconds: 86_400, name: 'd' },
  { seconds: 3600, name: 'h' },
  { seconds: 60, name: 'min' },
  { seconds: 1, name: 's' },
] as const;

export function duration(totalSeconds: number): string {
  let left = Math.max(0, Math.round(totalSeconds));
  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    const amount = Math.floor(left / unit.seconds);
    if (amount > 0) {
      parts.push(`${String(amount)} ${unit.name}`);
      left -= amount * unit.seconds;
    }
  }
  return parts.length === 0 ? '0 s' : parts.join(' ');
}

export function playTime(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = twoDigits(whole % 60);
  return hours > 0
    ? `${String(hours)}:${twoDigits(minutes)}:${rest}`
    : `${String(minutes)}:${rest}`;
}

export function hoursMinutes(minutes: number): string {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return hours === 0 ? `${String(rest)}m` : `${String(hours)}h ${twoDigits(rest)}m`;
}

export function clockOfMinutes(minuteOfDay: number): string {
  const wrapped = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  return `${twoDigits(Math.floor(wrapped / 60))}:${twoDigits(wrapped % 60)}`;
}

export function minutesOfDay(moment: number): number {
  const date = new Date(moment);
  return date.getHours() * 60 + date.getMinutes();
}

export function dayKeyOf(moment: number): string {
  return localDayKey(new Date(moment));
}

export function startOfDayKey(day: string): number {
  const [year, month, date] = DAY_PARTS.parse(DAY_KEY.parse(day).split('-'));
  return new Date(year, month - 1, date).getTime();
}

export function shiftDay(day: string, by: number): string {
  const start = new Date(startOfDayKey(day));
  return dayKeyOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + by).getTime());
}

const SHORT_DATE = zonedDateFormat({ day: 'numeric', month: 'short' });
const WEEKDAY_SHORT = zonedDateFormat({ weekday: 'short' });
const MONTH_SHORT = zonedDateFormat({ month: 'short' });
const HOUR_ONLY = zonedDateFormat({ hour: 'numeric' });
const LONG_DATE = zonedDateFormat({ weekday: 'long', day: 'numeric', month: 'long' });
const HOUR_OF_DAY = zonedDateFormat({ hour: '2-digit', hourCycle: 'h23' }, 'en-GB');

export function shortDate(moment: Date | string | number): string {
  return SHORT_DATE(null).format(new Date(moment));
}

export function weekdayShort(moment: number): string {
  return WEEKDAY_SHORT(null).format(new Date(moment));
}

export function monthShort(moment: number): string {
  return MONTH_SHORT(null).format(new Date(moment));
}

export function shortClock(moment: Date | string, timeZone: string | null = null): string {
  const at = new Date(moment);
  if (at.getMinutes() !== 0) {
    return clock(at, timeZone);
  }
  return HOUR_ONLY(timeZone).format(at);
}

export function longDate(moment: Date | string, timeZone: string | null = null): string {
  return LONG_DATE(timeZone).format(new Date(moment));
}

export function hourOf(moment: Date | string, timeZone: string | null = null): number {
  return Number(HOUR_OF_DAY(timeZone).format(new Date(moment)));
}

export function zoneLabel(zone: string): string {
  return zone.replaceAll('_', ' ').replaceAll('/', ' › ');
}

export function endOfDayKey(day: string): number {
  return startOfDayKey(shiftDay(day, 1));
}

const WALL_FIELDS = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
} as const;

const WALL_FORMAT = zonedDateFormat(WALL_FIELDS, 'en-US');

function wallField(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const part = parts.find((entry) => entry.type === type);
  if (part === undefined) {
    throw new Error(`The time zone formatter returned no ${type}`);
  }
  return Number(part.value);
}

function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = WALL_FORMAT(timeZone).formatToParts(new Date(at));
  const wall = Date.UTC(
    wallField(parts, 'year'),
    wallField(parts, 'month') - 1,
    wallField(parts, 'day'),
    wallField(parts, 'hour'),
    wallField(parts, 'minute'),
    wallField(parts, 'second'),
  );
  return wall - Math.floor(at / 1000) * 1000;
}

export function zonedInstant(day: string, minuteOfDay: number, timeZone: string): number {
  const wall = Date.parse(`${DAY_KEY.parse(day)}T00:00:00Z`) + minuteOfDay * MINUTE_MS;
  const first = wall - zoneOffsetMs(wall, timeZone);
  return wall - zoneOffsetMs(first, timeZone);
}

export function zonedStartOfDay(day: string, timeZone: string): number {
  return zonedInstant(day, 0, timeZone);
}

export function dayBoundsOf(
  day: string,
  timeZone: string | null,
): { readonly start: number; readonly end: number } {
  if (timeZone === null) {
    return { start: startOfDayKey(day), end: endOfDayKey(day) };
  }
  return {
    start: zonedStartOfDay(day, timeZone),
    end: zonedStartOfDay(shiftDay(day, 1), timeZone),
  };
}

export function zoneOffsetSecondsAt(moment: number): number {
  return -new Date(moment).getTimezoneOffset() * 60;
}

export function daysBetween(day: string, today: string): number {
  return Math.round((startOfDayKey(today) - startOfDayKey(day)) / DAY_MS);
}

export function dayAge(day: string, today: string): string {
  const days = daysBetween(day, today);
  if (days <= 0) {
    return 'Today';
  }
  return days === 1 ? 'Yesterday' : `${String(days)} days ago`;
}

export function dayTitle(title: string, day: string, today: string): string {
  return day === today ? title : `${dayLabel(startOfDayKey(day), startOfDayKey(today))} · ${title}`;
}
