import { DAY_MS } from '../../../../format/time';

export type StatsRange = 'week' | 'month' | 'year';

export interface StatsPeriod {
  readonly range: StatsRange;
  readonly startMs: number;
  readonly endMs: number;
  readonly label: string;
  readonly bucketStarts: readonly number[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DAYS_IN_WEEK = 7;
const MONTHS_IN_YEAR = 12;

function dayStart(moment: number): Date {
  const at = new Date(moment);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

export function weekStartOf(moment: number): number {
  const day = dayStart(moment);
  const sinceMonday = (day.getDay() + DAYS_IN_WEEK - 1) % DAYS_IN_WEEK;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday).getTime();
}

function monthName(moment: number): string {
  return MONTHS[new Date(moment).getMonth()] ?? '';
}

function dayAndMonth(moment: number): string {
  const at = new Date(moment);
  return `${String(at.getDate())} ${monthName(moment).slice(0, 3)}`;
}

function inDays(start: number, count: number): readonly number[] {
  const first = new Date(start);
  return Array.from({ length: count }, (_, index) =>
    new Date(first.getFullYear(), first.getMonth(), first.getDate() + index).getTime(),
  );
}

function weekPeriod(moment: number): StatsPeriod {
  const startMs = weekStartOf(moment);
  const bucketStarts = inDays(startMs, DAYS_IN_WEEK);
  const first = new Date(startMs);
  const endMs = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() + DAYS_IN_WEEK,
  ).getTime();
  const lastDay = bucketStarts[DAYS_IN_WEEK - 1] ?? startMs;
  return {
    range: 'week',
    startMs,
    endMs,
    label: `${dayAndMonth(startMs)} to ${dayAndMonth(lastDay)}`,
    bucketStarts,
  };
}

function monthPeriod(moment: number): StatsPeriod {
  const at = new Date(moment);
  const start = new Date(at.getFullYear(), at.getMonth(), 1);
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 1);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return {
    range: 'month',
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: `${monthName(moment)} ${String(start.getFullYear())}`,
    bucketStarts: inDays(start.getTime(), days),
  };
}

function yearPeriod(moment: number): StatsPeriod {
  const year = new Date(moment).getFullYear();
  return {
    range: 'year',
    startMs: new Date(year, 0, 1).getTime(),
    endMs: new Date(year + 1, 0, 1).getTime(),
    label: String(year),
    bucketStarts: Array.from({ length: MONTHS_IN_YEAR }, (_, month) =>
      new Date(year, month, 1).getTime(),
    ),
  };
}

export function periodAt(range: StatsRange, moment: number): StatsPeriod {
  if (range === 'week') {
    return weekPeriod(moment);
  }
  return range === 'month' ? monthPeriod(moment) : yearPeriod(moment);
}

export function shiftPeriod(period: StatsPeriod, by: number): StatsPeriod {
  const start = new Date(period.startMs);
  const year = start.getFullYear();
  const month = start.getMonth();
  const day = start.getDate();
  if (period.range === 'week') {
    return weekPeriod(new Date(year, month, day + DAYS_IN_WEEK * by).getTime());
  }
  return period.range === 'month'
    ? monthPeriod(new Date(year, month + by, 1).getTime())
    : yearPeriod(new Date(year + by, 0, 1).getTime());
}

export function canStepForward(period: StatsPeriod, now: number): boolean {
  return period.endMs <= now;
}

export function bucketIndexOf(period: StatsPeriod, moment: number): number | null {
  if (moment < period.startMs || moment >= period.endMs) {
    return null;
  }
  let found = 0;
  period.bucketStarts.forEach((start, index) => {
    if (start <= moment) {
      found = index;
    }
  });
  return found;
}
