import { z } from 'zod';
import { HEAT_LEVELS } from './treadmill-stats';
import { LOCAL_DAY, STATS_RANGES } from './treadmill-days';

export const PRINTER_GAP = z.strictObject({
  from: z.int().min(0).max(1440),
  to: z.int().min(0).max(1440),
});

export type PrinterGap = z.infer<typeof PRINTER_GAP>;

export const PRINTER_DAY = z.strictObject({
  day: LOCAL_DAY,
  jobs: z.int().nonnegative(),
  canceled: z.int().nonnegative(),
  failed: z.int().nonnegative(),
  pages: z.number().nonnegative(),
  sheets: z.number().nonnegative(),
  mono: z.number().nonnegative(),
  color: z.number().nonnegative(),
  duplexPages: z.number().nonnegative(),
  activeSeconds: z.number().nonnegative(),
  onlineSeconds: z.number().nonnegative(),
  offlineSeconds: z.number().nonnegative(),
  restarts: z.int().nonnegative(),
  errors: z.int().nonnegative(),
  jams: z.int().nonnegative(),
  hours: z.array(z.number().nonnegative()).length(24),
  counterPages: z.number().nonnegative().nullable(),
  estimatedPages: z.number().nonnegative().nullable(),
  gaps: z.array(PRINTER_GAP),
});

export type PrinterDay = z.infer<typeof PRINTER_DAY>;

export const PRINTER_TOTALS = z.strictObject({
  pages: z.number().nonnegative(),
  jobs: z.number().int().nonnegative(),
  sheets: z.number().nonnegative(),
  color: z.number().nonnegative(),
  mono: z.number().nonnegative(),
  duplexPages: z.number().nonnegative(),
  colorShare: z.number().min(0).max(1).nullable(),
  duplexShare: z.number().min(0).max(1).nullable(),
  paperSaved: z.number().nonnegative(),
  notAttributed: z.number().nonnegative(),
  coveredDays: z.int().nonnegative(),
});

export type PrinterTotals = z.infer<typeof PRINTER_TOTALS>;

export const PRINTER_BUCKET = z.strictObject({
  key: z.string(),
  pages: z.number().nonnegative(),
  jobs: z.int().nonnegative(),
  color: z.number().nonnegative(),
  mono: z.number().nonnegative(),
  covered: z.boolean(),
});

export type PrinterBucket = z.infer<typeof PRINTER_BUCKET>;

export const PRINTER_DELTA = z.strictObject({
  pages: z.number().nullable(),
  jobs: z.number().nullable(),
  sheets: z.number().nullable(),
  colorShare: z.number().nullable(),
  duplexShare: z.number().nullable(),
  paperSaved: z.number().nullable(),
});

export const PRINTER_STREAK = z.strictObject({
  current: z.int().nonnegative(),
  longest: z.int().nonnegative(),
});

export const PRINTER_BEST = z.strictObject({
  day: LOCAL_DAY,
  pages: z.number().nonnegative(),
});

export const PRINTER_HEAT_DAY = z.strictObject({
  day: LOCAL_DAY,
  pages: z.number().nonnegative(),
  level: z.int().min(0).max(HEAT_LEVELS),
  covered: z.boolean(),
});

export const PRINTER_RELIABILITY = z.strictObject({
  onlinePercent: z.number().min(0).max(100).nullable(),
  restarts: z.int().nonnegative(),
  jams: z.int().nonnegative(),
  errors: z.int().nonnegative(),
  months: z.array(
    z.strictObject({
      month: z.string(),
      jams: z.int().nonnegative(),
      errors: z.int().nonnegative(),
    }),
  ),
});

export const PRINTER_STATS = z.strictObject({
  period: z.enum(STATS_RANGES),
  from: LOCAL_DAY,
  to: LOCAL_DAY,
  buckets: z.array(PRINTER_BUCKET),
  previousBuckets: z.array(PRINTER_BUCKET),
  totals: PRINTER_TOTALS,
  previous: PRINTER_TOTALS,
  delta: PRINTER_DELTA,
  average7: z.array(z.number().nonnegative()),
  average30: z.array(z.number().nonnegative()),
  busiestDay: PRINTER_BEST.nullable(),
  pagesPerJob: z.array(z.strictObject({ label: z.string(), jobs: z.int().nonnegative() })),
  printFree: PRINTER_STREAK,
  printing: PRINTER_STREAK,
  heatmap: z.array(PRINTER_HEAT_DAY),
  weekdayHour: z.array(z.array(z.number().nonnegative()).length(24)).length(7),
  reliability: PRINTER_RELIABILITY,
  lifetimePages: z.number().nonnegative().nullable(),
});

export type PrinterStats = z.infer<typeof PRINTER_STATS>;
