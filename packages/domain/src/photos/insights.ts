import { z } from 'zod';
import { DRIVE_DURATION_BUCKETS } from '../drive/query';
import { COUNT, DAY, ID, MONTH, NAME } from './shared';

export const PHOTO_INSIGHT_RANGES = ['this_year', 'last_12_months', 'all_time'] as const;

export type PhotoInsightRange = (typeof PHOTO_INSIGHT_RANGES)[number];

export const PHOTO_INSIGHT_KINDS = ['photo', 'screenshot', 'raw', 'video'] as const;

export type PhotoInsightKind = (typeof PHOTO_INSIGHT_KINDS)[number];

export const PHOTO_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

const WEEKDAY = z.int().min(0).max(6);
const HOUR = z.int().min(0).max(23);

const KIND_TOTAL = z
  .strictObject({ kind: z.enum(PHOTO_INSIGHT_KINDS), items: COUNT, bytes: COUNT })
  .readonly();

const KIND_GROWTH = z
  .strictObject({ month: MONTH, kind: z.enum(PHOTO_INSIGHT_KINDS), items: COUNT, bytes: COUNT })
  .readonly();

const CAMERA = z
  .strictObject({ make: NAME.nullable(), model: NAME.nullable(), items: COUNT })
  .readonly();

const LENS = z.strictObject({ name: NAME, items: COUNT }).readonly();

const ROOT_BYTES = z
  .strictObject({
    rootId: ID,
    photos: COUNT,
    videos: COUNT,
    photoBytes: COUNT,
    videoBytes: COUNT,
  })
  .readonly();

const LARGEST_VIDEO = z
  .strictObject({ itemId: ID, bytes: COUNT, durationMs: COUNT.nullable() })
  .readonly();

const COUNTRY = z
  .strictObject({ countryCode: z.string().length(2), country: NAME, items: COUNT })
  .readonly();

const COVERAGE = z
  .strictObject({ deviceId: ID, name: NAME, backedUp: COUNT, total: COUNT })
  .refine((coverage) => coverage.backedUp <= coverage.total, {
    message: 'backed up cannot pass the phone’s total',
    path: ['backedUp'],
  })
  .readonly();

export const PHOTO_INSIGHTS = z
  .strictObject({
    range: z.enum(PHOTO_INSIGHT_RANGES),
    items: COUNT,
    bytes: COUNT,
    kinds: z.array(KIND_TOTAL).readonly(),
    growth: z.array(KIND_GROWTH).readonly().nullable(),
    cameras: z.array(CAMERA).readonly(),
    lenses: z.array(LENS).readonly(),
    roots: z.array(ROOT_BYTES).readonly(),
    largestVideos: z.array(LARGEST_VIDEO).readonly(),
    videoTotals: z
      .strictObject({ items: COUNT, bytes: COUNT, durationMs: COUNT, longestMs: COUNT.nullable() })
      .readonly(),
    durationBuckets: z
      .array(
        z
          .strictObject({
            bucket: z.enum(DRIVE_DURATION_BUCKETS),
            items: COUNT,
            bytes: COUNT,
          })
          .readonly(),
      )
      .readonly(),
    hoursAddedPerMonth: z
      .array(z.strictObject({ month: MONTH, hours: z.number().nonnegative() }).readonly())
      .readonly()
      .nullable(),
    busiestDays: z.array(z.strictObject({ day: DAY, items: COUNT }).readonly()).readonly(),
    perDay: z.array(z.strictObject({ day: DAY, items: COUNT }).readonly()).readonly(),
    weekdayByHour: z
      .array(z.strictObject({ weekday: WEEKDAY, hour: HOUR, items: COUNT }).readonly())
      .readonly(),
    seasonByHour: z
      .array(z.strictObject({ season: z.enum(PHOTO_SEASONS), hour: HOUR, items: COUNT }).readonly())
      .readonly(),
    places: z.strictObject({ places: COUNT, countries: z.array(COUNTRY).readonly() }).readonly(),
    backupCoverage: z.array(COVERAGE).readonly(),
  })
  .readonly();

export type PhotoInsights = z.infer<typeof PHOTO_INSIGHTS>;

export const PHOTO_INSIGHTS_QUERY = z.strictObject({ range: z.enum(PHOTO_INSIGHT_RANGES) });
