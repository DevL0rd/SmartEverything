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

export const DRIVE_SYNC_ERROR = z
  .strictObject({
    relPath: z.string().min(1).nullable(),
    message: z.string().min(1),
    at: MOMENT,
  })
  .readonly();

export type DriveSyncError = z.infer<typeof DRIVE_SYNC_ERROR>;

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
  needBytes: COUNT,
  lastSyncedAt: MOMENT.nullable(),
  errors: z.array(DRIVE_SYNC_ERROR).readonly(),
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

const SYNC_SETTING_FIELDS = {
  excluded: z.array(z.string().min(1)).readonly().optional(),
  ignorePatterns: z.array(z.string().min(1)).readonly().optional(),
  conflictCopies: z.boolean().optional(),
} as const;

function syncSettingsMatchMode(
  placement: {
    readonly mode: DrivePlacementMode;
    readonly excluded?: readonly string[] | undefined;
    readonly ignorePatterns?: readonly string[] | undefined;
    readonly conflictCopies?: boolean | undefined;
  },
  context: z.RefinementCtx,
): void {
  const present = [placement.excluded, placement.ignorePatterns, placement.conflictCopies].map(
    (value) => value !== undefined,
  );
  const expected = placement.mode === 'synced';
  if (present.some((isPresent) => isPresent !== expected)) {
    context.addIssue({
      code: 'custom',
      message: expected
        ? 'a synced placement carries excluded, ignorePatterns and conflictCopies'
        : 'only a synced placement carries excluded, ignorePatterns and conflictCopies',
      path: ['mode'],
    });
  }
}

export const DRIVE_PLACEMENT = z
  .strictObject({
    id: ID,
    deviceId: ID,
    ...DRIVE_PLACEMENT_TARGET_FIELDS,
    ...SYNC_SETTING_FIELDS,
    hold: DRIVE_PLACEMENT_HOLD.nullable(),
    createdBy: ID,
    createdAt: MOMENT,
    status: DRIVE_PLACEMENT_STATUS,
  })
  .superRefine(syncSettingsMatchMode)
  .readonly();

export type DrivePlacement = z.infer<typeof DRIVE_PLACEMENT>;

export const DRIVE_PLACEMENT_SET = z
  .strictObject({ deviceId: ID, ...DRIVE_PLACEMENT_TARGET_FIELDS, ...SYNC_SETTING_FIELDS })
  .superRefine(syncSettingsMatchMode)
  .readonly();

export type DrivePlacementSet = z.infer<typeof DRIVE_PLACEMENT_SET>;
