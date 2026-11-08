import { z } from 'zod';

const ID = z.uuid();
const BYTES = z.int().nonnegative();

export const DRIVE_USAGE = z
  .strictObject({
    profileId: ID.nullable(),
    live: BYTES,
    versions: BYTES,
    trash: BYTES,
  })
  .readonly();

export type DriveUsage = z.infer<typeof DRIVE_USAGE>;
