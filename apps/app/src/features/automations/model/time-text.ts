import type { SunEvent } from '@smarteverything/domain';
import { duration } from '../../../format/time';

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

function sameDays(days: readonly number[], wanted: readonly number[]): boolean {
  return days.length === wanted.length && wanted.every((day) => days.includes(day));
}

export function weekdaysText(days: readonly number[]): string {
  if (sameDays(days, [0, 1, 2, 3, 4, 5, 6])) {
    return 'every day';
  }
  if (sameDays(days, [1, 2, 3, 4, 5])) {
    return 'on weekdays';
  }
  if (sameDays(days, [0, 6])) {
    return 'at weekends';
  }
  const named = WEEK_ORDER.filter((day) => days.includes(day)).map((day) => WEEKDAY_SHORT[day]);
  return `on ${named.join(', ')}`;
}

export function offsetText(event: SunEvent, offsetMinutes: number): string {
  if (offsetMinutes === 0) {
    return `at ${event}`;
  }
  const amount = duration(Math.abs(offsetMinutes) * 60);
  return `${amount} ${offsetMinutes < 0 ? 'before' : 'after'} ${event}`;
}

export function sentenceStart(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
