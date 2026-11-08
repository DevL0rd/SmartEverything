import { z } from 'zod';
import { DRIVE_ITEM, DRIVE_ITEM_KINDS } from './item';

const ID = z.uuid();
const DAY = z.iso.date();

const MINUTE_MS = 60_000;

export const DRIVE_DURATION_BUCKETS = ['under_1m', '1_to_10m', '10_to_60m', 'over_60m'] as const;

export type DriveDurationBucket = (typeof DRIVE_DURATION_BUCKETS)[number];

export function driveDurationBucket(durationMs: number): DriveDurationBucket {
  if (durationMs < MINUTE_MS) {
    return 'under_1m';
  }
  if (durationMs < 10 * MINUTE_MS) {
    return '1_to_10m';
  }
  if (durationMs < 60 * MINUTE_MS) {
    return '10_to_60m';
  }
  return 'over_60m';
}

export const DRIVE_SORT_FIELDS = [
  'name',
  'modifiedAt',
  'takenAt',
  'addedAt',
  'openedAt',
  'bytes',
] as const;

export const DRIVE_SORT = z
  .strictObject({
    field: z.enum(DRIVE_SORT_FIELDS),
    direction: z.enum(['asc', 'desc']),
  })
  .readonly();

export type DriveSort = z.infer<typeof DRIVE_SORT>;

export const DRIVE_DAY_RANGE = z
  .strictObject({ from: DAY.nullable(), to: DAY.nullable() })
  .refine((range) => range.from === null || range.to === null || range.from <= range.to, {
    message: 'from must not be after to',
    path: ['to'],
  })
  .readonly();

export type DriveDayRange = z.infer<typeof DRIVE_DAY_RANGE>;

export const DRIVE_QUERY = z
  .strictObject({
    text: z.string().trim().min(1).nullable(),
    rootId: ID.nullable(),
    folderId: ID.nullable(),
    kinds: z.array(z.enum(DRIVE_ITEM_KINDS)).min(1).readonly().nullable(),
    starred: z.boolean().nullable(),
    duration: z.enum(DRIVE_DURATION_BUCKETS).nullable(),
    taken: DRIVE_DAY_RANGE.nullable(),
    sort: DRIVE_SORT,
    cursor: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveQuery = z.infer<typeof DRIVE_QUERY>;

export const DRIVE_QUERY_PAGE = z
  .strictObject({
    items: z.array(DRIVE_ITEM).readonly(),
    next: z.string().min(1).nullable(),
  })
  .readonly();

export type DriveQueryPage = z.infer<typeof DRIVE_QUERY_PAGE>;
