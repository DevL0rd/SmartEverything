import { z } from 'zod';
import { BOTTLE_DAY, BOTTLE_STATS_RANGES } from './bottle-days';

const ML = z.number().nonnegative();

const WINDOW = z.strictObject({ from: BOTTLE_DAY, to: BOTTLE_DAY });

export const BOTTLE_COMPARISON = z.strictObject({
  value: z.number(),
  previous: z.number(),
  deltaPct: z.number().nullable(),
});

export type BottleComparison = z.infer<typeof BOTTLE_COMPARISON>;

const PARTS = z.strictObject({ bottleMl: ML, loggedMl: ML, otherMl: ML });

export type BottleSourceParts = z.infer<typeof PARTS>;

export const BOTTLE_BAR = z.strictObject({
  key: z.string().min(1),
  totalMl: ML,
  previousMl: ML.nullable(),
  goalMl: ML,
  goalMet: z.boolean(),
  parts: PARTS.nullable(),
});

export type BottleBar = z.infer<typeof BOTTLE_BAR>;

export const BOTTLE_HEAT_DAY = z.strictObject({ day: BOTTLE_DAY, ml: ML, goalMl: ML });

export const BOTTLE_DAILY = z.strictObject({
  day: BOTTLE_DAY,
  drinks: z.int().nonnegative(),
  longestGapMin: z.int().nonnegative(),
  firstMinute: z.int().nonnegative().nullable(),
  lastMinute: z.int().nonnegative().nullable(),
  fills: z.int().nonnegative(),
  litresFilled: ML,
});

export type BottleDaily = z.infer<typeof BOTTLE_DAILY>;

const DAILY_AVERAGES = z.strictObject({
  drinksPerDay: ML,
  fillsPerDay: ML,
  litresPerDay: ML,
  longestGapMin: ML,
});

export type BottleDailyAverages = z.infer<typeof DAILY_AVERAGES>;

export const BOTTLE_SIZE_BIN_ML = 20;

export const BOTTLE_SIZE_BINS = 15;

export const BOTTLE_STATS = z.strictObject({
  view: z.literal('stats'),
  range: z.enum(BOTTLE_STATS_RANGES),
  today: BOTTLE_DAY,
  window: WINDOW,
  previousWindow: WINDOW,
  goalMl: ML,
  chips: z.strictObject({
    total: BOTTLE_COMPARISON,
    perDay: BOTTLE_COMPARISON,
    drinks: BOTTLE_COMPARISON,
    drinkSize: BOTTLE_COMPARISON,
  }),
  bars: z.array(BOTTLE_BAR),
  averages: z.strictObject({ sevenDayMl: ML, thirtyDayMl: ML }),
  heatmap: z.array(BOTTLE_HEAT_DAY),
  rhythm: z.array(z.array(ML).length(24)).length(7),
  sizes: z.strictObject({
    binMl: z.literal(BOTTLE_SIZE_BIN_ML),
    bins: z.array(z.int().nonnegative()).length(BOTTLE_SIZE_BINS),
    medianMl: ML.nullable(),
    count: z.int().nonnegative(),
  }),
  daily: z.array(BOTTLE_DAILY).length(30),
  dailyAverages: DAILY_AVERAGES,
  previousDailyAverages: DAILY_AVERAGES,
  streak: z.strictObject({
    current: z.int().nonnegative(),
    atRisk: z.boolean(),
    longest: z.int().nonnegative(),
    longestEnd: BOTTLE_DAY.nullable(),
    completion30: z.array(z.boolean()).length(30),
  }),
  bests: z.strictObject({
    bestDay: z.strictObject({ day: BOTTLE_DAY, ml: ML }).nullable(),
    bestWeek: z.strictObject({ from: BOTTLE_DAY, ml: ML }).nullable(),
  }),
  sources: PARTS,
});

export type BottleStats = z.infer<typeof BOTTLE_STATS>;

export interface BottleDayTotal {
  readonly day: string;
  readonly totalMl: number;
  readonly bottleMl: number;
  readonly loggedMl: number;
  readonly otherMl: number;
  readonly goalMl: number;
}

export interface BottleStatDrink {
  readonly day: string;
  readonly minute: number;
  readonly ml: number;
}

export interface BottleStatFill {
  readonly day: string;
  readonly ml: number;
}

export interface BottleStatsInput {
  readonly range: (typeof BOTTLE_STATS_RANGES)[number];
  readonly today: string;
  readonly goalMl: number;
  readonly days: readonly BottleDayTotal[];
  readonly drinks: readonly BottleStatDrink[];
  readonly fills: readonly BottleStatFill[];
  readonly hours: readonly { readonly todayMl: number; readonly yesterdayMl: number }[];
}
