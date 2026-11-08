import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_CONFLICT_RESOLUTIONS = ['keep_hub', 'keep_client', 'keep_both'] as const;

export type DriveConflictResolution = (typeof DRIVE_CONFLICT_RESOLUTIONS)[number];

export const DRIVE_CONFLICT = z
  .strictObject({
    id: ID,
    rootId: ID,
    itemId: ID,
    conflictItemId: ID,
    relPath: z.string().min(1),
    conflictRelPath: z.string().min(1),
    hubRev: z.int().positive(),
    baseRev: z.int().positive(),
    deviceId: ID,
    profileId: ID.nullable(),
    at: MOMENT,
    resolvedAt: MOMENT.nullable(),
    resolution: z.enum(DRIVE_CONFLICT_RESOLUTIONS).nullable(),
  })
  .refine((conflict) => (conflict.resolvedAt === null) === (conflict.resolution === null), {
    message: 'a resolved conflict has both a time and a resolution, an open one has neither',
    path: ['resolution'],
  })
  .readonly();

export type DriveConflict = z.infer<typeof DRIVE_CONFLICT>;

export const DRIVE_CONFLICT_RESOLVE = z
  .strictObject({
    conflictId: ID,
    resolution: z.enum(DRIVE_CONFLICT_RESOLUTIONS),
  })
  .readonly();

export type DriveConflictResolve = z.infer<typeof DRIVE_CONFLICT_RESOLVE>;
