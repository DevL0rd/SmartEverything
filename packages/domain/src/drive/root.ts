import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();
const SHARE = z.number().min(0).max(1);

export const DRIVE_ROOT_STATES = ['scanning', 'ready', 'unresponsive', 'error'] as const;

export type DriveRootState = (typeof DRIVE_ROOT_STATES)[number];

export const DRIVE_ROOT_SCOPES = ['home', 'person'] as const;

export type DriveRootScope = (typeof DRIVE_ROOT_SCOPES)[number];

export const DRIVE_DATA_SPACE = z
  .strictObject({
    totalBytes: COUNT,
    freeBytes: COUNT,
    fsType: z.string().min(1),
  })
  .refine((space) => space.freeBytes <= space.totalBytes, {
    message: 'free space cannot exceed the disk size',
    path: ['freeBytes'],
  })
  .readonly();

export type DriveDataSpace = z.infer<typeof DRIVE_DATA_SPACE>;

export const DRIVE_ROOT_HEALTH = z
  .strictObject({
    hashedShare: SHARE,
    verifiedShare: SHARE,
    corrupt: COUNT,
    lastScrubAt: MOMENT.nullable(),
    lastBackupAt: MOMENT.nullable(),
  })
  .readonly();

export type DriveRootHealth = z.infer<typeof DRIVE_ROOT_HEALTH>;

export const DRIVE_ROOT = z
  .strictObject({
    id: ID,
    scope: z.enum(DRIVE_ROOT_SCOPES),
    ownerProfileId: ID.nullable(),
    indexId: z.string().min(1),
    state: z.enum(DRIVE_ROOT_STATES),
    stateReason: z.string().min(1).nullable(),
    items: COUNT,
    folders: COUNT,
    bytes: COUNT,
    scannedAt: MOMENT.nullable(),
    health: DRIVE_ROOT_HEALTH,
    versions: z.boolean(),
    skipPatterns: z.array(z.string().min(1)).readonly(),
    includeHidden: z.boolean(),
  })
  .superRefine((root, context) => {
    if ((root.scope === 'person') !== (root.ownerProfileId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'a personal drive needs an owner and the shared drive has none',
        path: ['ownerProfileId'],
      });
    }
  })
  .readonly();

export type DriveRoot = z.infer<typeof DRIVE_ROOT>;
