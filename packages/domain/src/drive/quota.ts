import { z } from 'zod';

const ID = z.uuid();
const BYTES = z.int().nonnegative();

export const DRIVE_QUOTA = z.strictObject({ profileId: ID, bytes: BYTES }).readonly();

export type DriveQuota = z.infer<typeof DRIVE_QUOTA>;

export const DRIVE_QUOTA_SET = z
  .strictObject({ profileId: ID, bytes: BYTES.nullable() })
  .readonly();

export type DriveQuotaSet = z.infer<typeof DRIVE_QUOTA_SET>;
