import { z } from 'zod';

const ID = z.uuid();
const BYTES = z.int().nonnegative();
const COUNT = z.int().nonnegative();

export const DRIVE_USAGE = z
  .strictObject({
    profileId: ID.nullable(),
    items: COUNT,
    folders: COUNT,
    live: BYTES,
    versions: BYTES,
    trash: BYTES,
  })
  .readonly();

export type DriveUsage = z.infer<typeof DRIVE_USAGE>;
