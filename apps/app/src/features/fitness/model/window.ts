import { z } from 'zod';
import { dateFormat } from '../../../format/locale';
import { twoDigits } from '../../../format/number';
import {
  DAY_MS,
  dayKeyOf,
  dayLabel,
  endOfDayKey,
  monthShort,
  shiftDay,
  shortDate,
  startOfDayKey,
  weekdayShort,
} from '../../../format/time';

export const RANGES = ['day', 'week', 'month', 'year'] as const;

export type Range = (typeof RANGES)[number];

export const RANGE = z.enum(RANGES);

interface Bucket {
  readonly start: number;
  readonly end: number;
  readonly label: string;
}

export interface Window {
  readonly range: Range;
  readonly start: number;
  readonly end: number;
  readonly buckets: readonly Bucket[];
  readonly firstDay: string;
  readonly lastDay: string;
}

function dayBuckets(start: Date, days: number, label: (moment: number) => string): Bucket[] {
  return Array.from({ length: days }, (_, index) => {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).getTime();
    const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index + 1);
    return { start: from, end: to.getTime(), label: label(from) };
  });
}

function hourBuckets(start: Date): Bucket[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour);
    const to = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour + 1);
    return { start: from.getTime(), end: to.getTime(), label: twoDigits(hour) };
  });
}

function monthBuckets(year: number): Bucket[] {
  return Array.from({ length: 12 }, (_, month) => {
    const start = new Date(year, month, 1).getTime();
    return { start, end: new Date(year, month + 1, 1).getTime(), label: monthShort(start) };
  });
}

function bucketsOf(range: Range, anchor: Date): Bucket[] {
  switch (range) {
    case 'day':
      return hourBuckets(anchor);
    case 'week':
      return dayBuckets(anchor, 7, weekdayShort);
    case 'month': {
      const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
      return dayBuckets(anchor, days, (moment) => String(new Date(moment).getDate()));
    }
    case 'year':
      return monthBuckets(anchor.getFullYear());
  }
}

function spanOf(range: Range, anchor: Date): { readonly start: number; readonly end: number } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  switch (range) {
    case 'day':
      return {
        start: anchor.getTime(),
        end: new Date(year, month, anchor.getDate() + 1).getTime(),
      };
    case 'week': {
      const monday = anchor.getDate() - ((anchor.getDay() + 6) % 7);
      return {
        start: new Date(year, month, monday).getTime(),
        end: new Date(year, month, monday + 7).getTime(),
      };
    }
    case 'month':
      return {
        start: new Date(year, month, 1).getTime(),
        end: new Date(year, month + 1, 1).getTime(),
      };
    case 'year':
      return { start: new Date(year, 0, 1).getTime(), end: new Date(year + 1, 0, 1).getTime() };
  }
}

export function windowOf(range: Range, day: string): Window {
  const anchor = new Date(startOfDayKey(day));
  const { start, end } = spanOf(range, anchor);
  return {
    range,
    start,
    end,
    buckets: bucketsOf(range, new Date(start)),
    firstDay: dayKeyOf(start),
    lastDay: dayKeyOf(end - 1),
  };
}

export function elapsedPart(window: Window, today: string): Window {
  const end = Math.min(window.end, endOfDayKey(today));
  if (end === window.end) {
    return window;
  }
  return {
    ...window,
    end,
    buckets: window.buckets.filter((bucket) => bucket.start < end),
    lastDay: dayKeyOf(end - 1),
  };
}

export function shiftAnchor(range: Range, day: string, by: number): string {
  const start = new Date(startOfDayKey(day));
  switch (range) {
    case 'day':
      return shiftDay(day, by);
    case 'week':
      return shiftDay(day, by * 7);
    case 'month': {
      const target = new Date(start.getFullYear(), start.getMonth() + by, 1);
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(start.getDate(), last));
      return dayKeyOf(target.getTime());
    }
    case 'year':
      return dayKeyOf(new Date(start.getFullYear() + by, start.getMonth(), 1).getTime());
  }
}

export function previousWindow(window: Window): Window {
  return windowOf(window.range, shiftAnchor(window.range, window.firstDay, -1));
}

export function windowLabel(window: Window, today: string): string {
  const first = new Date(window.start);
  switch (window.range) {
    case 'day': {
      const label = dayLabel(first, startOfDayKey(today));
      return label === 'Today' || label === 'Yesterday'
        ? `${label} · ${weekdayShort(window.start)} ${shortDate(window.start)}`
        : label;
    }
    case 'week':
      return `${shortDate(window.start)} – ${shortDate(window.end - 1)}`;
    case 'month':
      return dateFormat({ month: 'short', year: 'numeric' }).format(first);
    case 'year':
      return String(first.getFullYear());
  }
}

export function daysIn(window: Window): number {
  return Math.round((window.end - window.start) / DAY_MS);
}
