import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_SYNC_ERROR = z
  .strictObject({
    relPath: z.string().min(1).nullable(),
    message: z.string().min(1),
    at: MOMENT,
  })
  .readonly();

export type DriveSyncError = z.infer<typeof DRIVE_SYNC_ERROR>;

export const DRIVE_SYNC_CLIENT = z
  .strictObject({
    clientId: ID,
    rootId: ID,
    deviceId: ID,
    profileId: ID,
    enabled: z.boolean(),
    selected: z.array(z.string().min(1)).readonly(),
    lastSeq: COUNT,
    lastSeenAt: MOMENT.nullable(),
    needBytes: COUNT,
    errors: z.array(DRIVE_SYNC_ERROR).readonly(),
  })
  .readonly();

export type DriveSyncClient = z.infer<typeof DRIVE_SYNC_CLIENT>;

export const DRIVE_SYNC_CLIENT_UPDATE = z
  .strictObject({
    clientId: ID,
    rootId: ID,
    enabled: z.boolean(),
    selected: z.array(z.string().min(1)).readonly(),
  })
  .readonly();

export type DriveSyncClientUpdate = z.infer<typeof DRIVE_SYNC_CLIENT_UPDATE>;
