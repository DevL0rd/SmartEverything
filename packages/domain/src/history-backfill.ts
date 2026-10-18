import { z } from 'zod';
import { HISTORY_INTERVAL_MS, HISTORY_SOURCE_CLASS, HISTORY_WINDOW_MS } from './history-settings';

export const HISTORY_MAX_POINTS = 5000;

export const HISTORY_MAX_TOPICS = 32;

export const HISTORY_DOWNSAMPLE_METHODS = ['none', 'mean'] as const;

const EPOCH_MS = z.int().nonnegative();

const HISTORY_TOPIC = z.string().trim().min(1).max(64);

const HISTORY_QUERY_BASE = {
  topics: z.array(HISTORY_TOPIC).min(1).max(HISTORY_MAX_TOPICS),
  maxPoints: z.int().min(2).max(HISTORY_MAX_POINTS),
};

const TARGET = { device: z.uuid(), source: HISTORY_SOURCE_CLASS };

export const HISTORY_QUERY = z.union([
  z.strictObject({ ...HISTORY_QUERY_BASE, sinceMs: EPOCH_MS }),
  z.strictObject({ ...HISTORY_QUERY_BASE, windowMs: HISTORY_WINDOW_MS }),
]);

export type HistoryQuery = z.infer<typeof HISTORY_QUERY>;

export const HISTORY_BACKFILL_REQUEST = z.union([
  z.strictObject({ ...TARGET, ...HISTORY_QUERY_BASE, sinceMs: EPOCH_MS }),
  z.strictObject({ ...TARGET, ...HISTORY_QUERY_BASE, windowMs: HISTORY_WINDOW_MS }),
]);

export type HistoryBackfillRequest = z.infer<typeof HISTORY_BACKFILL_REQUEST>;

export const HISTORY_SERIES = z.strictObject({
  topic: HISTORY_TOPIC,
  key: z.string().min(1).max(100),
  unit: z.string().min(1).max(20).nullable(),
  values: z.array(z.number().nullable()),
});

export type HistorySeries = z.infer<typeof HISTORY_SERIES>;

export const HISTORY_DOWNSAMPLE = z.strictObject({
  method: z.enum(HISTORY_DOWNSAMPLE_METHODS),
  sourcePoints: z.int().nonnegative(),
  stepMs: z.int().positive(),
});

const COLUMNS = {
  intervalMs: HISTORY_INTERVAL_MS,
  windowMs: HISTORY_WINDOW_MS,
  oldestMs: EPOCH_MS.nullable(),
  newestMs: EPOCH_MS.nullable(),
  timestamps: z.array(EPOCH_MS),
  series: z.array(HISTORY_SERIES),
  downsample: HISTORY_DOWNSAMPLE,
};

function hasOneValuePerTimestamp(columns: {
  readonly timestamps: readonly number[];
  readonly series: readonly HistorySeries[];
}): boolean {
  return columns.series.every((item) => item.values.length === columns.timestamps.length);
}

const COLUMNS_MESSAGE = { message: 'every series needs one value per timestamp' };

export const HISTORY_COLUMNS = z
  .strictObject(COLUMNS)
  .refine(hasOneValuePerTimestamp, COLUMNS_MESSAGE);

export type HistoryColumns = z.infer<typeof HISTORY_COLUMNS>;

export const HISTORY_BACKFILL_RESPONSE = z
  .strictObject({ ...TARGET, ...COLUMNS })
  .refine(hasOneValuePerTimestamp, COLUMNS_MESSAGE);

export type HistoryBackfillResponse = z.infer<typeof HISTORY_BACKFILL_RESPONSE>;
