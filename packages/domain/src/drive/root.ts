import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();
const SHARE = z.number().min(0).max(1);

export const DRIVE_ROOT_KINDS = ['folder', 'volume', 'managed', 'cameras', 'ai_images'] as const;

export type DriveRootKind = (typeof DRIVE_ROOT_KINDS)[number];

export const DRIVE_ROOT_STATES = ['scanning', 'ready', 'offline', 'unresponsive', 'error'] as const;

export type DriveRootState = (typeof DRIVE_ROOT_STATES)[number];

export const DRIVE_ROOT_SCOPES = ['home', 'person'] as const;

export const DRIVE_VOLUME = z
  .strictObject({
    mountId: z.string().min(1),
    fsType: z.string().min(1),
    network: z.boolean(),
  })
  .readonly();

export type DriveVolume = z.infer<typeof DRIVE_VOLUME>;

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

export const DRIVE_ROOT_SYNC = z
  .strictObject({
    ignorePatterns: z.array(z.string().min(1)).readonly(),
    conflictCopies: z.boolean(),
    clients: z.array(z.strictObject({ clientId: ID, enabled: z.boolean() }).readonly()).readonly(),
  })
  .readonly();

export type DriveRootSync = z.infer<typeof DRIVE_ROOT_SYNC>;

const COMMON = {
  id: ID,
  label: z.string().trim().min(1),
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
  inPhotos: z.boolean(),
  skipPatterns: z.array(z.string().min(1)).readonly(),
  includeHidden: z.boolean(),
};

const PHYSICAL = {
  ...COMMON,
  path: z.string().min(1),
  synced: z.boolean(),
  sync: DRIVE_ROOT_SYNC,
};

const VIRTUAL = {
  ...COMMON,
  path: z.null(),
  readOnly: z.literal(true),
  versions: z.literal(false),
  synced: z.literal(false),
  sync: z.null(),
};

export const DRIVE_ROOT = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...PHYSICAL,
      kind: z.literal('folder'),
      readOnly: z.boolean(),
      versions: z.boolean(),
      volume: DRIVE_VOLUME.nullable(),
    }),
    z.strictObject({
      ...PHYSICAL,
      kind: z.literal('volume'),
      readOnly: z.boolean(),
      versions: z.boolean(),
      volume: DRIVE_VOLUME,
    }),
    z.strictObject({
      ...PHYSICAL,
      kind: z.literal('managed'),
      readOnly: z.literal(false),
      versions: z.boolean(),
      volume: DRIVE_VOLUME.nullable(),
    }),
    z.strictObject({ ...VIRTUAL, kind: z.literal('cameras') }),
    z.strictObject({ ...VIRTUAL, kind: z.literal('ai_images') }),
  ])
  .superRefine((root, context) => {
    if ((root.scope === 'person') !== (root.ownerProfileId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'a person root needs an owner and a home root has none',
        path: ['ownerProfileId'],
      });
    }
    if (root.readOnly && root.versions) {
      context.addIssue({
        code: 'custom',
        message: 'a read-only root keeps no versions because the hub never writes there',
        path: ['versions'],
      });
    }
  })
  .readonly();

export type DriveRoot = z.infer<typeof DRIVE_ROOT>;
