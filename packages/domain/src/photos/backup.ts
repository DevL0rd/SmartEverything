import { z } from 'zod';
import { COUNT, ID, MOMENT, NAME } from './shared';

export const BACKUP_PLATFORMS = ['android', 'ios', 'desktop'] as const;

export const BACKUP_ASSET_STATES = ['pending', 'uploading', 'done', 'failed', 'skipped'] as const;

export type BackupAssetState = (typeof BACKUP_ASSET_STATES)[number];

export const BACKUP_SETTINGS = z
  .strictObject({
    enabled: z.boolean(),
    folders: z.array(z.string().min(1)).readonly(),
    wifiOnly: z.boolean(),
    chargingOnly: z.boolean(),
    includeVideos: z.boolean(),
  })
  .readonly();

export type BackupSettings = z.infer<typeof BACKUP_SETTINGS>;

export const BACKUP_DEVICE = z
  .strictObject({
    id: ID,
    profileId: ID,
    deviceId: z.string().min(1),
    name: NAME,
    platform: z.enum(BACKUP_PLATFORMS),
    lastSeenAt: MOMENT,
    settings: BACKUP_SETTINGS,
  })
  .readonly();

export type BackupDevice = z.infer<typeof BACKUP_DEVICE>;

export const BACKUP_REGISTER = z
  .strictObject({
    deviceId: z.string().min(1),
    name: NAME,
    platform: z.enum(BACKUP_PLATFORMS),
    settings: BACKUP_SETTINGS,
  })
  .readonly();

export type BackupRegister = z.infer<typeof BACKUP_REGISTER>;

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const BACKUP_HAVE = z
  .strictObject({
    deviceId: z.string().min(1),
    assets: z
      .array(z.strictObject({ localId: z.string().min(1), sha256: SHA256 }).readonly())
      .min(1)
      .readonly(),
  })
  .readonly();

export type BackupHave = z.infer<typeof BACKUP_HAVE>;

export const BACKUP_HAVE_RESULT = z
  .strictObject({
    have: z.array(z.strictObject({ localId: z.string().min(1), itemId: ID }).readonly()).readonly(),
    missing: z.array(z.string().min(1)).readonly(),
  })
  .readonly();

export type BackupHaveResult = z.infer<typeof BACKUP_HAVE_RESULT>;

export const BACKUP_STATE = z
  .strictObject({
    device: BACKUP_DEVICE,
    backedUp: COUNT,
    pending: COUNT,
    uploading: COUNT,
    failed: COUNT,
    bytesLeft: COUNT,
    lastBackupAt: MOMENT.nullable(),
    targetFolder: z.string().min(1),
  })
  .readonly();

export type BackupState = z.infer<typeof BACKUP_STATE>;

export const PHOTO_UPLOAD_TARGET_REQUEST = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('backup'),
      deviceId: z.string().min(1),
      takenAt: z.iso.datetime({ offset: true }),
    }),
    z.strictObject({ kind: z.literal('manual') }),
  ])
  .readonly();

export const PHOTO_UPLOAD_TARGET = z
  .strictObject({ folderId: z.uuid(), path: z.string().min(1) })
  .readonly();
