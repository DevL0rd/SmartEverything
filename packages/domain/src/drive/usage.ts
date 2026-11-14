import { z } from 'zod';

const ID = z.uuid();
const BYTES = z.int().nonnegative();
const COUNT = z.int().nonnegative();

const USAGE_FIELDS = {
  profileId: ID.nullable(),
  items: COUNT,
  folders: COUNT,
  live: BYTES,
  versions: BYTES,
  trash: BYTES,
};

export const DRIVE_USAGE = z.strictObject(USAGE_FIELDS).readonly();

export type DriveUsage = z.infer<typeof DRIVE_USAGE>;

export const DRIVE_USAGE_TOTALS = z
  .strictObject({ ...USAGE_FIELDS, quota: BYTES.nullable() })
  .readonly();

export type DriveUsageTotals = z.infer<typeof DRIVE_USAGE_TOTALS>;
