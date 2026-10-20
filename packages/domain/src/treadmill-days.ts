import { z } from 'zod';

const DAY_MS = 86_400_000;

export const LOCAL_DAY = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'a calendar day such as 2026-10-18');

export const STATS_RANGES = ['day', 'week', 'month', 'year'] as const;

export type StatsRange = (typeof STATS_RANGES)[number];

export interface DayWindow {
  readonly from: string;
  readonly to: string;
}

export function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

export function dayOfNumber(number: number): string {
  return new Date(number * DAY_MS).toISOString().slice(0, 10);
}

export function sessionDayOf(iso: string, zoneOffsetSeconds: number): string {
  return new Date(Date.parse(iso) + zoneOffsetSeconds * 1000).toISOString().slice(0, 10);
}

export function sessionHourOf(iso: string, zoneOffsetSeconds: number): string {
  return new Date(Date.parse(iso) + zoneOffsetSeconds * 1000).toISOString().slice(0, 13);
}

export function addDays(day: string, count: number): string {
  return dayOfNumber(dayNumber(day) + count);
}

function monthStart(day: string, shift: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + shift, 1))
    .toISOString()
    .slice(0, 10);
}

function weekStart(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

export function windowOf(range: StatsRange, anchor: string): DayWindow {
  switch (range) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = weekStart(anchor);
      return { from, to: addDays(from, 6) };
    }
    case 'month':
      return { from: monthStart(anchor, 0), to: addDays(monthStart(anchor, 1), -1) };
    case 'year': {
      const year = new Date(`${anchor}T00:00:00Z`).getUTCFullYear();
      return { from: `${String(year)}-01-01`, to: `${String(year)}-12-31` };
    }
  }
}

export function previousWindowOf(range: StatsRange, anchor: string): DayWindow {
  switch (range) {
    case 'day':
      return windowOf('day', addDays(anchor, -1));
    case 'week':
      return windowOf('week', addDays(anchor, -7));
    case 'month':
      return windowOf('month', monthStart(anchor, -1));
    case 'year':
      return windowOf(
        'year',
        `${String(new Date(`${anchor}T00:00:00Z`).getUTCFullYear() - 1)}-06-01`,
      );
  }
}

export function daysIn(window: DayWindow): readonly string[] {
  const first = dayNumber(window.from);
  const last = dayNumber(window.to);
  return Array.from({ length: last - first + 1 }, (_, index) => dayOfNumber(first + index));
}

export function bucketKeysOf(range: StatsRange, window: DayWindow): readonly string[] {
  if (range === 'day') {
    return Array.from(
      { length: 24 },
      (_, hour) => `${window.from}T${String(hour).padStart(2, '0')}`,
    );
  }
  const days = daysIn(window);
  return range === 'year' ? [...new Set(days.map((day) => day.slice(0, 7)))] : days;
}

export function bucketKeyOf(range: StatsRange, iso: string, zoneOffsetSeconds: number): string {
  if (range === 'day') {
    return sessionHourOf(iso, zoneOffsetSeconds);
  }
  const day = sessionDayOf(iso, zoneOffsetSeconds);
  return range === 'year' ? day.slice(0, 7) : day;
}
