import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_PLACEMENT_MODES = ['synced', 'mounted'] as const;

export const DRIVE_PLACEMENT_MODE = z.enum(DRIVE_PLACEMENT_MODES);

export type DrivePlacementMode = z.infer<typeof DRIVE_PLACEMENT_MODE>;

export const DRIVE_PLACEMENT_HOLDS = ['trashed', 'no_access', 'sync_off'] as const;

export const DRIVE_PLACEMENT_HOLD = z.enum(DRIVE_PLACEMENT_HOLDS);

export type DrivePlacementHold = z.infer<typeof DRIVE_PLACEMENT_HOLD>;

export const DRIVE_PLACEMENT_STATES = [
  'starting',
  'mounted',
  'syncing',
  'up_to_date',
  'offline',
  'stopped',
  'failed',
  'blocked',
] as const;

export const DRIVE_PLACEMENT_STATE = z.enum(DRIVE_PLACEMENT_STATES);

export type DrivePlacementState = z.infer<typeof DRIVE_PLACEMENT_STATE>;

export const DRIVE_PLACEMENT_TIERS = ['full', 'basic'] as const;

export const DRIVE_PLACEMENT_ROUTES = ['local', 'remote'] as const;

export const DRIVE_PLACEMENT_BASIC_LIMITS = z
  .strictObject({
    maxFileBytes: COUNT.nullable(),
    wholeFileOpen: z.boolean(),
    offline: z.literal(false),
  })
  .readonly();

export type DrivePlacementBasicLimits = z.infer<typeof DRIVE_PLACEMENT_BASIC_LIMITS>;

export const DRIVE_PLACEMENT_STATUS_FIELDS = {
  state: DRIVE_PLACEMENT_STATE,
  tier: z.enum(DRIVE_PLACEMENT_TIERS).nullable(),
  basicLimits: DRIVE_PLACEMENT_BASIC_LIMITS.nullable(),
  readOnly: z.boolean(),
  route: z.enum(DRIVE_PLACEMENT_ROUTES).nullable(),
  cacheBytes: COUNT,
  pinnedBytes: COUNT,
  openFiles: COUNT,
  pendingUploads: COUNT,
  reason: z.string().min(1).nullable(),
  reportedAt: MOMENT,
} as const;

export const DRIVE_PLACEMENT_STATUS = z.strictObject(DRIVE_PLACEMENT_STATUS_FIELDS).readonly();

export type DrivePlacementStatus = z.infer<typeof DRIVE_PLACEMENT_STATUS>;

export const DRIVE_PLACEMENT_TARGET_FIELDS = {
  rootId: ID,
  folderItemId: ID.nullable(),
  mode: DRIVE_PLACEMENT_MODE,
  localPath: z.string().min(1),
  enabled: z.boolean(),
} as const;

function refuseSyncedFolder(
  placement: { readonly mode: DrivePlacementMode; readonly folderItemId: string | null },
  context: z.RefinementCtx,
): void {
  if (placement.mode === 'synced' && placement.folderItemId !== null) {
    context.addIssue({
      code: 'custom',
      message: 'a synced placement is a whole library folder; sync a subfolder with selective sync',
      path: ['folderItemId'],
    });
  }
}

export const DRIVE_PLACEMENT = z
  .strictObject({
    id: ID,
    deviceId: ID,
    ...DRIVE_PLACEMENT_TARGET_FIELDS,
    hold: DRIVE_PLACEMENT_HOLD.nullable(),
    createdBy: ID,
    createdAt: MOMENT,
    status: DRIVE_PLACEMENT_STATUS,
  })
  .superRefine(refuseSyncedFolder)
  .readonly();

export type DrivePlacement = z.infer<typeof DRIVE_PLACEMENT>;

export const DRIVE_PLACEMENT_SET = z
  .strictObject({ deviceId: ID, ...DRIVE_PLACEMENT_TARGET_FIELDS })
  .superRefine(refuseSyncedFolder)
  .readonly();

export type DrivePlacementSet = z.infer<typeof DRIVE_PLACEMENT_SET>;
