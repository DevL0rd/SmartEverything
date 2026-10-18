import { PHONE_SCREEN_TIMEOUTS, type PhoneDetail } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import { hoursMinutes, startOfDayKey, weekdayShort } from '../../../format/time';

export type ScreenSection = NonNullable<PhoneDetail['screen']>;

export interface TimeoutOption {
  readonly value: string;
  readonly label: string;
}

const SECONDS_PER_MINUTE = 60;

function timeoutLabel(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${String(seconds)} s`;
  return `${String(seconds / SECONDS_PER_MINUTE)} min`;
}

export const TIMEOUT_OPTIONS: readonly TimeoutOption[] = PHONE_SCREEN_TIMEOUTS.map((seconds) => ({
  value: String(seconds),
  label: timeoutLabel(seconds),
}));

export function timeoutValueOf(seconds: number | null): string {
  return seconds === null ? '' : String(seconds);
}

export function timeoutSpoken(seconds: number): string {
  return timeoutLabel(seconds);
}

export function weekBars(days: ScreenSection['usage']): readonly Bar[] {
  if (days === null) return [];
  return days.screenMinutesByDay.map((entry) => ({
    key: entry.day,
    value: entry.minutes,
    label: weekdayShort(startOfDayKey(entry.day)),
  }));
}

export function todayKey(days: NonNullable<ScreenSection['usage']>): string | null {
  return days.screenMinutesByDay.at(-1)?.day ?? null;
}

export function averageBefore(days: NonNullable<ScreenSection['usage']>): number | null {
  const earlier = days.screenMinutesByDay.slice(0, -1);
  if (earlier.length === 0) return null;
  const total = earlier.reduce((sum, entry) => sum + entry.minutes, 0);
  return total / earlier.length;
}

const NEAR_AVERAGE = 0.05;

export function againstAverage(
  today: number,
  average: number | null,
  whose: string,
): string | null {
  if (average === null || average <= 0) return null;
  const change = (today - average) / average;
  if (Math.abs(change) < NEAR_AVERAGE) return `About ${whose} average`;
  const share = String(Math.round(Math.abs(change) * 100));
  return `${share} % ${change < 0 ? 'less' : 'more'} than ${whose} average`;
}

export function weekSpoken(days: NonNullable<ScreenSection['usage']>): string {
  const parts = days.screenMinutesByDay.map(
    (entry) => `${weekdayShort(startOfDayKey(entry.day))} ${hoursMinutes(entry.minutes)}`,
  );
  return `Screen time, last 7 days: ${parts.join(', ')}`;
}

export function foldText(fold: ScreenSection['fold']): string | null {
  if (fold === null) return null;
  return fold === 'open' ? 'Open' : 'Folded';
}
