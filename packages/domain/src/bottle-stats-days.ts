import {
  bottleDayAfter,
  bottleDayIndex,
  bottleDaysBetween,
  bottleDaysInMonth,
  bottleMonthsBack,
  type BottleDayWindow,
  type BottleStatsRange,
} from './bottle-days';
import type {
  BottleBar,
  BottleComparison,
  BottleDayTotal,
  BottleSourceParts,
  BottleStatsInput,
} from './bottle-stats-types';

export const HEATMAP_DAYS = 371;

const WEEK_DAYS = 7;

const MONTH_DAYS = 30;

const MONTHS_IN_YEAR = 12;

const HOURS = 24;

export type DayLookup = ReadonlyMap<string, BottleDayTotal>;

export function lookupOf(days: readonly BottleDayTotal[]): DayLookup {
  return new Map(days.map((day) => [day.day, day]));
}

function dayOf(lookup: DayLookup, day: string, goalMl: number): BottleDayTotal {
  return lookup.get(day) ?? { day, totalMl: 0, bottleMl: 0, loggedMl: 0, otherMl: 0, goalMl };
}

export function sourcesOf(
  lookup: DayLookup,
  window: BottleDayWindow,
  goalMl: number,
): BottleSourceParts & { readonly totalMl: number } {
  return bottleDaysBetween(window).reduce(
    (sums, day) => {
      const found = dayOf(lookup, day, goalMl);
      return {
        totalMl: sums.totalMl + found.totalMl,
        bottleMl: sums.bottleMl + found.bottleMl,
        loggedMl: sums.loggedMl + found.loggedMl,
        otherMl: sums.otherMl + found.otherMl,
      };
    },
    { totalMl: 0, bottleMl: 0, loggedMl: 0, otherMl: 0 },
  );
}

export function compare(value: number, previous: number): BottleComparison {
  return {
    value,
    previous,
    deltaPct: previous === 0 ? null : Math.round(((value - previous) / previous) * 1000) / 10,
  };
}

const RANGE_LENGTH: Readonly<Record<BottleStatsRange, number>> = {
  day: 1,
  week: WEEK_DAYS,
  month: MONTH_DAYS,
  year: 365,
};

export function windowsOf(
  range: BottleStatsRange,
  today: string,
): { readonly window: BottleDayWindow; readonly previous: BottleDayWindow } {
  const length = RANGE_LENGTH[range];
  return {
    window: { from: bottleDayAfter(today, 1 - length), to: today },
    previous: {
      from: bottleDayAfter(today, 1 - 2 * length),
      to: bottleDayAfter(today, -length),
    },
  };
}

function isMet(lookup: DayLookup, day: string): boolean {
  const found = lookup.get(day);
  return found !== undefined && found.goalMl > 0 && found.totalMl >= found.goalMl;
}

function hourBars(input: BottleStatsInput): BottleBar[] {
  return input.hours.map((hour, index) => ({
    key: String(index).padStart(2, '0'),
    totalMl: hour.todayMl,
    previousMl: hour.yesterdayMl,
    goalMl: input.goalMl / HOURS,
    goalMet: false,
    parts: null,
  }));
}

function dayBars(input: BottleStatsInput, lookup: DayLookup, window: BottleDayWindow): BottleBar[] {
  const length = bottleDayIndex(window.to) - bottleDayIndex(window.from) + 1;
  return bottleDaysBetween(window).map((day) => {
    const found = dayOf(lookup, day, input.goalMl);
    const before = dayOf(lookup, bottleDayAfter(day, -length), input.goalMl);
    return {
      key: day,
      totalMl: found.totalMl,
      previousMl: before.totalMl,
      goalMl: found.goalMl,
      goalMet: isMet(lookup, day),
      parts: { bottleMl: found.bottleMl, loggedMl: found.loggedMl, otherMl: found.otherMl },
    };
  });
}

function monthAverage(
  input: BottleStatsInput,
  lookup: DayLookup,
  month: string,
): { readonly average: number; readonly parts: BottleSourceParts } {
  const last = `${month}-${String(bottleDaysInMonth(month)).padStart(2, '0')}`;
  const to = last < input.today ? last : input.today;
  const from = `${month}-01`;
  const sums = sourcesOf(lookup, { from, to }, input.goalMl);
  const length = bottleDayIndex(to) - bottleDayIndex(from) + 1;
  return {
    average: sums.totalMl / length,
    parts: {
      bottleMl: sums.bottleMl / length,
      loggedMl: sums.loggedMl / length,
      otherMl: sums.otherMl / length,
    },
  };
}

function monthBars(input: BottleStatsInput, lookup: DayLookup): BottleBar[] {
  return Array.from({ length: MONTHS_IN_YEAR }, (_, offset) => {
    const month = bottleMonthsBack(input.today, MONTHS_IN_YEAR - 1 - offset);
    const current = monthAverage(input, lookup, month);
    const before = monthAverage(input, lookup, bottleMonthsBack(`${month}-01`, MONTHS_IN_YEAR));
    return {
      key: month,
      totalMl: current.average,
      previousMl: before.average,
      goalMl: input.goalMl,
      goalMet: current.average >= input.goalMl,
      parts: current.parts,
    };
  });
}

export function barsOf(
  input: BottleStatsInput,
  lookup: DayLookup,
  window: BottleDayWindow,
): BottleBar[] {
  switch (input.range) {
    case 'day':
      return hourBars(input);
    case 'week':
    case 'month':
      return dayBars(input, lookup, window);
    case 'year':
      return monthBars(input, lookup);
  }
}

export function averageOver(
  lookup: DayLookup,
  today: string,
  days: number,
  goalMl: number,
): number {
  const sums = sourcesOf(lookup, { from: bottleDayAfter(today, 1 - days), to: today }, goalMl);
  return sums.totalMl / days;
}

export function heatmapOf(
  lookup: DayLookup,
  today: string,
  goalMl: number,
): readonly { readonly day: string; readonly ml: number; readonly goalMl: number }[] {
  return bottleDaysBetween({ from: bottleDayAfter(today, 1 - HEATMAP_DAYS), to: today }).map(
    (day) => {
      const found = dayOf(lookup, day, goalMl);
      return { day, ml: found.totalMl, goalMl: found.goalMl };
    },
  );
}

export interface Streak {
  readonly current: number;
  readonly atRisk: boolean;
  readonly longest: number;
  readonly longestEnd: string | null;
  readonly completion30: boolean[];
}

export function streakOf(lookup: DayLookup, today: string, first: string): Streak {
  let run = 0;
  let longest = 0;
  let longestEnd: string | null = null;
  let beforeToday = 0;
  for (const day of bottleDaysBetween({ from: first < today ? first : today, to: today })) {
    run = isMet(lookup, day) ? run + 1 : 0;
    if (day === bottleDayAfter(today, -1)) {
      beforeToday = run;
    }
    if (run > longest) {
      longest = run;
      longestEnd = day;
    }
  }
  const todayMet = isMet(lookup, today);
  const current = todayMet ? run : beforeToday;
  return {
    current,
    atRisk: !todayMet && current > 0,
    longest,
    longestEnd,
    completion30: bottleDaysBetween({
      from: bottleDayAfter(today, 1 - MONTH_DAYS),
      to: today,
    }).map((day) => isMet(lookup, day)),
  };
}

export function bestsOf(
  lookup: DayLookup,
  today: string,
  first: string,
  goalMl: number,
): {
  readonly bestDay: { readonly day: string; readonly ml: number } | null;
  readonly bestWeek: { readonly from: string; readonly ml: number } | null;
} {
  let bestDay: { day: string; ml: number } | null = null;
  let bestWeek: { from: string; ml: number } | null = null;
  let window = 0;
  const days = bottleDaysBetween({ from: first < today ? first : today, to: today });
  days.forEach((day, index) => {
    const ml = dayOf(lookup, day, goalMl).totalMl;
    const leaving = days[index - WEEK_DAYS];
    window += ml - (leaving === undefined ? 0 : dayOf(lookup, leaving, goalMl).totalMl);
    if (ml > 0 && (bestDay === null || ml > bestDay.ml)) {
      bestDay = { day, ml };
    }
    if (window > 0 && (bestWeek === null || window > bestWeek.ml)) {
      bestWeek = { from: bottleDayAfter(day, 1 - WEEK_DAYS), ml: window };
    }
  });
  return { bestDay, bestWeek };
}

export function firstDayOf(days: readonly BottleDayTotal[], today: string): string {
  return days.reduce((first, day) => (day.day < first ? day.day : first), today);
}
