import { z } from 'zod';
import { dateFormat } from './locale';
import { twoDigits } from './number';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const DAY_KEY = z.iso.date();

const DAY_PARTS = z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()]);

function zoned(timeZone: string | null): Intl.DateTimeFormatOptions {
  return timeZone === null ? {} : { timeZone };
}

export function clock(moment: Date | string | number, timeZone: string | null = null): string {
  return dateFormat({
    hour: 'numeric',
    minute: '2-digit',
    ...zoned(timeZone),
  }).format(new Date(moment));
}

export function localDayKey(
  moment: Date | string | number,
  timeZone: string | null = null,
): string {
  return dateFormat(
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...zoned(timeZone),
    },
    'en-CA',
  ).format(new Date(moment));
}

export function dayLabel(
  moment: Date | string | number,
  now: number,
  timeZone: string | null = null,
): string {
  const key = localDayKey(moment, timeZone);
  if (key === localDayKey(new Date(now), timeZone)) {
    return 'Today';
  }
  if (key === localDayKey(new Date(now - DAY_MS), timeZone)) {
    return 'Yesterday';
  }
  return dateFormat({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...zoned(timeZone),
  }).format(new Date(moment));
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

export function shortDate(moment: Date | string | number): string {
  return dateFormat({ day: 'numeric', month: 'short' }).format(new Date(moment));
}

export function weekdayShort(moment: number): string {
  return dateFormat({ weekday: 'short' }).format(new Date(moment));
}

export function monthShort(moment: number): string {
  return dateFormat({ month: 'short' }).format(new Date(moment));
}

export function shortClock(moment: Date | string, timeZone: string | null = null): string {
  const at = new Date(moment);
  if (at.getMinutes() !== 0) {
    return clock(at, timeZone);
  }
  return dateFormat({ hour: 'numeric', ...zoned(timeZone) }).format(at);
}

export function longDate(moment: Date | string, timeZone: string | null = null): string {
  return dateFormat({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...zoned(timeZone),
  }).format(new Date(moment));
}

export function hourOf(moment: Date | string, timeZone: string | null = null): number {
  return Number(
    dateFormat(
      {
        hour: '2-digit',
        hourCycle: 'h23',
        ...zoned(timeZone),
      },
      'en-GB',
    ).format(new Date(moment)),
  );
}

export function zoneLabel(zone: string): string {
  return zone.replaceAll('_', ' ').replaceAll('/', ' › ');
}

export function endOfDayKey(day: string): number {
  return startOfDayKey(shiftDay(day, 1));
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
