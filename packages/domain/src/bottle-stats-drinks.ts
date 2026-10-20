import { bottleDayAfter, bottleDaysBetween, bottleWeekday } from './bottle-days';
import {
  BOTTLE_SIZE_BINS,
  BOTTLE_SIZE_BIN_ML,
  type BottleDaily,
  type BottleDailyAverages,
  type BottleStatDrink,
  type BottleStatFill,
} from './bottle-stats-types';

const HOURS = 24;

const RHYTHM_DAYS = 90;

const SIZE_DAYS = 30;

const DAILY_DAYS = 30;

const FIRST_SIZE_ML = 20;

const MINUTES_PER_HOUR = 60;

const ML_PER_LITRE = 1000;

function within(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

export function rhythmOf(drinks: readonly BottleStatDrink[], today: string): number[][] {
  const from = bottleDayAfter(today, 1 - RHYTHM_DAYS);
  const days = bottleDaysBetween({ from, to: today });
  const inside = drinks.filter((item) => within(item.day, from, today));
  return Array.from({ length: 7 }, (_, weekday) => {
    const dayCount = days.filter((day) => bottleWeekday(day) === weekday).length;
    return Array.from({ length: HOURS }, (_hour, hour) => {
      const total = inside
        .filter(
          (item) =>
            bottleWeekday(item.day) === weekday &&
            Math.floor(item.minute / MINUTES_PER_HOUR) === hour,
        )
        .reduce((sum, item) => sum + item.ml, 0);
      return total / dayCount;
    });
  });
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.slice(Math.ceil(sorted.length / 2) - 1, Math.floor(sorted.length / 2) + 1);
  return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}

function sizeBinOf(ml: number): number {
  return Math.min(
    BOTTLE_SIZE_BINS - 1,
    Math.max(0, Math.floor((ml - FIRST_SIZE_ML) / BOTTLE_SIZE_BIN_ML)),
  );
}

export function sizesOf(
  drinks: readonly BottleStatDrink[],
  today: string,
): {
  readonly binMl: typeof BOTTLE_SIZE_BIN_ML;
  readonly bins: number[];
  readonly medianMl: number | null;
  readonly count: number;
} {
  const from = bottleDayAfter(today, 1 - SIZE_DAYS);
  const sizes = drinks.filter((item) => within(item.day, from, today)).map((item) => item.ml);
  return {
    binMl: BOTTLE_SIZE_BIN_ML,
    bins: Array.from(
      { length: BOTTLE_SIZE_BINS },
      (_, bin) => sizes.filter((ml) => sizeBinOf(ml) === bin).length,
    ),
    medianMl: medianOf(sizes),
    count: sizes.length,
  };
}

function longestGap(minutes: readonly number[]): number {
  const sorted = [...minutes].sort((left, right) => left - right);
  return sorted.reduce((gap, minute, index) => {
    const before = sorted[index - 1];
    return before === undefined ? gap : Math.max(gap, minute - before);
  }, 0);
}

export function dailyOf(
  drinks: readonly BottleStatDrink[],
  fills: readonly BottleStatFill[],
  lastDay: string,
): BottleDaily[] {
  return bottleDaysBetween({ from: bottleDayAfter(lastDay, 1 - DAILY_DAYS), to: lastDay }).map(
    (day) => {
      const minutes = drinks.filter((item) => item.day === day).map((item) => item.minute);
      const filled = fills.filter((item) => item.day === day);
      return {
        day,
        drinks: minutes.length,
        longestGapMin: longestGap(minutes),
        firstMinute: minutes.length === 0 ? null : Math.min(...minutes),
        lastMinute: minutes.length === 0 ? null : Math.max(...minutes),
        fills: filled.length,
        litresFilled: filled.reduce((total, item) => total + item.ml, 0) / ML_PER_LITRE,
      };
    },
  );
}

export function dailyAveragesOf(daily: readonly BottleDaily[]): BottleDailyAverages {
  const length = Math.max(1, daily.length);
  const sum = (pick: (day: BottleDaily) => number): number =>
    daily.reduce((total, day) => total + pick(day), 0);
  return {
    drinksPerDay: sum((day) => day.drinks) / length,
    fillsPerDay: sum((day) => day.fills) / length,
    litresPerDay: sum((day) => day.litresFilled) / length,
    longestGapMin: daily.reduce((gap, day) => Math.max(gap, day.longestGapMin), 0),
  };
}
