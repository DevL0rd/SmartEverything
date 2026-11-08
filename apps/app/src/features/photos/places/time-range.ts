import type { TimelineBucket } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import { monthShort } from '../../../format/time';
import type { TimeWindow } from './map-view';

export interface MonthRange {
  readonly start: number;
  readonly end: number;
}

export interface YearTick {
  readonly year: string;
  readonly share: number;
}

export function monthsOf(buckets: readonly TimelineBucket[]): readonly TimelineBucket[] {
  return [...buckets].sort((a, b) => compareText(a.month, b.month));
}

export function fullRange(months: readonly TimelineBucket[]): MonthRange {
  return { start: 0, end: Math.max(0, months.length - 1) };
}

export function isFull(range: MonthRange, months: readonly TimelineBucket[]): boolean {
  return range.start === 0 && range.end >= months.length - 1;
}

function monthStart(month: string): number {
  const [year, index] = month.split('-').map(Number);
  return Date.UTC(year ?? 0, (index ?? 1) - 1, 1);
}

function nextMonthStart(month: string): number {
  const start = new Date(monthStart(month));
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
}

export function windowOf(range: MonthRange, months: readonly TimelineBucket[]): TimeWindow {
  const first = months[range.start];
  const last = months[range.end];
  if (first === undefined || last === undefined || isFull(range, months)) return {};
  return {
    from: new Date(monthStart(first.month)).toISOString(),
    to: new Date(nextMonthStart(last.month) - 1).toISOString(),
  };
}

const MID_MONTH_MS = 14 * 24 * 60 * 60 * 1000;

export function monthLabel(month: string): string {
  return `${monthShort(monthStart(month) + MID_MONTH_MS)} ${month.slice(0, 4)}`;
}

export function rangeLabel(range: MonthRange, months: readonly TimelineBucket[]): string | null {
  const first = months[range.start];
  const last = months[range.end];
  if (first === undefined || last === undefined) return null;
  if (first.month === last.month) return `Showing ${monthLabel(first.month)}`;
  return `Showing ${monthLabel(first.month)} to ${monthLabel(last.month)}`;
}

export function shareOf(index: number, total: number): number {
  return total > 1 ? index / (total - 1) : 0;
}

export function indexAt(share: number, total: number): number {
  return Math.min(Math.max(0, total - 1), Math.max(0, Math.round(share * (total - 1))));
}

export function withStart(range: MonthRange, start: number): MonthRange {
  return { start: Math.min(start, range.end), end: range.end };
}

export function withEnd(range: MonthRange, end: number): MonthRange {
  return { start: range.start, end: Math.max(end, range.start) };
}

export function yearTicks(
  months: readonly TimelineBucket[],
  width: number,
  spacing: number,
): readonly YearTick[] {
  const ticks: YearTick[] = [];
  months.forEach((bucket, index) => {
    const year = bucket.month.slice(0, 4);
    if (months[index - 1]?.month.slice(0, 4) === year) return;
    const share = shareOf(index, months.length);
    const last = ticks.at(-1);
    if (last === undefined || (share - last.share) * width >= spacing) {
      ticks.push({ year, share });
    }
  });
  return ticks;
}
