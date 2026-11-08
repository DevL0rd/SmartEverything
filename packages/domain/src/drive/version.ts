import { z } from 'zod';
import { DRIVE_VIA } from './feed';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const DRIVE_VERSION = z
  .strictObject({
    id: ID,
    itemId: ID,
    rev: z.int().positive(),
    sha256: SHA256,
    bytes: z.int().nonnegative(),
    at: MOMENT,
    purgeAt: MOMENT,
    actorProfileId: ID.nullable(),
    via: z.enum(DRIVE_VIA),
    deviceId: ID.nullable(),
    addedByProfileId: ID.nullable(),
  })
  .refine((version) => Date.parse(version.purgeAt) > Date.parse(version.at), {
    message: 'purgeAt must be after at',
    path: ['purgeAt'],
  })
  .readonly();

export type DriveVersion = z.infer<typeof DRIVE_VERSION>;
