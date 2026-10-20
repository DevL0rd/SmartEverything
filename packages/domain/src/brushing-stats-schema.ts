import { z } from 'zod';
import { BRUSHING_GOAL } from './brushing-session';
import { BRUSH_INTENSITIES, BRUSH_MODES } from './toothbrush';
import { LOCAL_DAY, STATS_RANGES } from './treadmill-days';

export const BRUSHING_HEATMAP_DAYS = 365;

export const BRUSHING_AVERAGE_SHORT = 7;

export const BRUSHING_AVERAGE_LONG = 30;

export const SCORE_WEIGHTS = { goal: 50, completion: 30, pressure: 20 } as const;

export const SCORE_WEIGHT_TOTAL =
  SCORE_WEIGHTS.goal + SCORE_WEIGHTS.completion + SCORE_WEIGHTS.pressure;

export const BRUSHING_BUCKET = z.strictObject({
  key: z.string(),
  sessions: z.number().int().nonnegative(),
  seconds: z.number().nonnegative(),
  complete: z.number().int().nonnegative(),
  morning: z.number().int().nonnegative(),
  evening: z.number().int().nonnegative(),
  pressureSeconds: z.number().nonnegative(),
  excessSeconds: z.number().nonnegative(),
});

export type BrushingBucket = z.infer<typeof BRUSHING_BUCKET>;

export const BRUSHING_TOTALS = z.strictObject({
  sessions: z.number().int().nonnegative(),
  seconds: z.number().nonnegative(),
  complete: z.number().int().nonnegative(),
  activeDays: z.number().int().nonnegative(),
  goalDays: z.number().int().nonnegative(),
  pressureSeconds: z.number().nonnegative(),
  excessSeconds: z.number().nonnegative(),
});

export type BrushingTotals = z.infer<typeof BRUSHING_TOTALS>;

const DELTA = z.number().nullable();

export const BRUSHING_DELTA = z.strictObject({
  sessions: DELTA,
  seconds: DELTA,
  averageSeconds: DELTA,
  completion: DELTA,
});

export const BEST = z.strictObject({
  value: z.number().nonnegative(),
  at: z.iso.datetime({ offset: true }).nullable(),
  day: LOCAL_DAY.nullable(),
});

export const BRUSHING_BESTS = z.strictObject({
  longestSession: BEST.nullable(),
  bestWeek: BEST.nullable(),
  longestStreak: z.number().int().nonnegative(),
});

export const HEAT_KINDS = ['none', 'short', 'one', 'goal'] as const;

export const BRUSHING_HEAT_DAY = z.strictObject({
  day: LOCAL_DAY,
  sessions: z.number().int().nonnegative(),
  kind: z.enum(HEAT_KINDS),
});

export const BRUSHING_CONSISTENCY = z.strictObject({
  score: z.number().int().min(0).max(100).nullable(),
  goalRate: z.number().min(0).max(1),
  completionRate: z.number().min(0).max(1),
  pressureRate: z.number().min(0).max(1).nullable(),
});

export const BRUSHING_FACE_BUCKET = z.strictObject({
  key: z.string(),
  sessions: z.number().int().nonnegative(),
  special: z.number().int().nonnegative(),
});

export const BRUSHING_FORCE_BUCKET = z.strictObject({
  key: z.string(),
  averageN: z.number().nonnegative().nullable(),
  peakN: z.number().nonnegative().nullable(),
});

export type BrushingFaceBucket = z.infer<typeof BRUSHING_FACE_BUCKET>;

export type BrushingForceBucket = z.infer<typeof BRUSHING_FORCE_BUCKET>;

const MIX_COUNT = z.number().int().nonnegative();

export const MODE_MIX = z.record(z.enum(BRUSH_MODES), MIX_COUNT);

export const INTENSITY_MIX = z.record(z.enum(BRUSH_INTENSITIES), MIX_COUNT);

export const BRUSHING_STATS = z.strictObject({
  range: z.enum(STATS_RANGES),
  from: LOCAL_DAY,
  to: LOCAL_DAY,
  goal: BRUSHING_GOAL,
  buckets: z.array(BRUSHING_BUCKET),
  previousBuckets: z.array(BRUSHING_BUCKET),
  totals: BRUSHING_TOTALS,
  previous: BRUSHING_TOTALS,
  delta: BRUSHING_DELTA,
  average7: z.array(z.number().nonnegative()),
  average30: z.array(z.number().nonnegative()),
  averageSeconds: z.number().nonnegative(),
  completionRate: z.number().min(0).max(1),
  timeOfDay: z.array(z.number().int().nonnegative()).length(24),
  split: z.strictObject({
    morning: z.number().int().nonnegative(),
    evening: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  modeMix: MODE_MIX,
  intensityMix: INTENSITY_MIX,
  zoneSeconds: z.array(z.number().nonnegative()),
  excessShare: z.number().min(0).max(1).nullable(),
  lowPressureShare: z.number().min(0).max(1).nullable(),
  faces: z.array(BRUSHING_FACE_BUCKET).nullable(),
  force: z.array(BRUSHING_FORCE_BUCKET).nullable(),
  bests: BRUSHING_BESTS,
  streak: z.strictObject({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
  }),
  heatmap: z.array(BRUSHING_HEAT_DAY),
  consistency: BRUSHING_CONSISTENCY,
});

export type BrushingStats = z.infer<typeof BRUSHING_STATS>;

export type Best = z.infer<typeof BEST>;
