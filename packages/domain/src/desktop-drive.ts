import { z } from 'zod';
import { MAX_PAYLOAD_BYTES } from './drive/mount/ops';
import { formatByteRate, formatBytes } from './value-format';

const COUNT = z.int().nonnegative();
const POSITIVE = z.int().positive();
const NAME = z.string().min(1);

export const DESKTOP_DRIVE_CACHE = z
  .strictObject({
    maxAgeSeconds: POSITIVE,
    maxBytes: POSITIVE.nullable(),
    minFreeBytes: POSITIVE.nullable(),
    cleanupSeconds: POSITIVE,
  })
  .readonly();

export type DesktopDriveCache = z.infer<typeof DESKTOP_DRIVE_CACHE>;

export const DEFAULT_DESKTOP_DRIVE_CACHE: DesktopDriveCache = {
  maxAgeSeconds: 3600,
  maxBytes: null,
  minFreeBytes: null,
  cleanupSeconds: 60,
};

const KIB = 1024;
const MIB = 1024 * KIB;

export const MAX_BACKGROUND_WIRE_LIMIT = 65535;

export const DESKTOP_DRIVE_READDIR_PLUS = ['off', 'auto', 'always'] as const;

export const DESKTOP_DRIVE_UNTIL_CHANGED = 'changed';

const KEEP = z.union([z.literal(DESKTOP_DRIVE_UNTIL_CHANGED), COUNT]);

export const DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND = 'follow';

export const DESKTOP_DRIVE_TUNING = z
  .strictObject({
    maxBackground: POSITIVE.max(MAX_BACKGROUND_WIRE_LIMIT),
    congestionThreshold: z.union([z.literal(DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND), POSITIVE]),
    maxRequestBytes: POSITIVE,
    kernelReadaheadBytes: POSITIVE,
    readAheadBytes: COUNT,
    asyncRead: z.boolean(),
    writebackCache: z.boolean(),
    readdirPlus: z.enum(DESKTOP_DRIVE_READDIR_PLUS),
    parallelDirops: z.boolean(),
    entrySeconds: KEEP,
    attrSeconds: KEEP,
    negativeSeconds: KEEP,
    closeWaitsForUpload: z.boolean(),
    uploadDelaySeconds: COUNT,
    fsyncWaitsForHub: z.boolean(),
    uploadFiles: POSITIVE,
    uploadFramesInFlight: POSITIVE,
    pingSeconds: POSITIVE,
    deadAfterSeconds: POSITIVE,
    bulkFrameBytes: POSITIVE.max(MAX_PAYLOAD_BYTES),
    prefetchSmallFiles: z.boolean(),
  })
  .refine((tuning) => tuning.deadAfterSeconds > tuning.pingSeconds, {
    message: 'the dead-after time must be longer than the ping interval',
    path: ['deadAfterSeconds'],
  })
  .readonly();

export type DesktopDriveTuning = z.infer<typeof DESKTOP_DRIVE_TUNING>;

export const DEFAULT_DESKTOP_DRIVE_TUNING: DesktopDriveTuning = {
  maxBackground: 64,
  congestionThreshold: DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND,
  maxRequestBytes: MIB,
  kernelReadaheadBytes: 128 * KIB,
  readAheadBytes: 16 * MIB,
  asyncRead: true,
  writebackCache: true,
  readdirPlus: 'auto',
  parallelDirops: true,
  entrySeconds: DESKTOP_DRIVE_UNTIL_CHANGED,
  attrSeconds: DESKTOP_DRIVE_UNTIL_CHANGED,
  negativeSeconds: DESKTOP_DRIVE_UNTIL_CHANGED,
  closeWaitsForUpload: true,
  uploadDelaySeconds: 0,
  fsyncWaitsForHub: true,
  uploadFiles: 4,
  uploadFramesInFlight: 64,
  pingSeconds: 10,
  deadAfterSeconds: 30,
  bulkFrameBytes: MIB,
  prefetchSmallFiles: false,
};

export const DESKTOP_DRIVE_TUNING_REMOUNT_FIELDS = [
  'maxBackground',
  'congestionThreshold',
  'maxRequestBytes',
  'kernelReadaheadBytes',
  'asyncRead',
  'writebackCache',
  'readdirPlus',
  'parallelDirops',
] as const satisfies readonly (keyof DesktopDriveTuning)[];

export const DESKTOP_DRIVE_TUNING_WINDOWS_FIELDS = [
  'maxBackground',
  'congestionThreshold',
  'kernelReadaheadBytes',
  'readdirPlus',
] as const satisfies readonly (keyof DesktopDriveTuning)[];

export const DESKTOP_DRIVE_PLATFORMS = ['linux', 'macos', 'windows'] as const;

export const DESKTOP_DRIVE_TUNING_LIMITS = z
  .strictObject({
    platform: z.enum(DESKTOP_DRIVE_PLATFORMS),
    pageBytes: POSITIVE.nullable(),
    maxUserBackground: POSITIVE.nullable(),
    maxUserCongestionThreshold: POSITIVE.nullable(),
    maxRequestBytes: POSITIVE,
    kernelReadaheadOfferBytes: POSITIVE.nullable(),
  })
  .readonly();

export type DesktopDriveTuningLimits = z.infer<typeof DESKTOP_DRIVE_TUNING_LIMITS>;

export const DESKTOP_DRIVE_TUNING_STATE = z
  .strictObject({
    saved: DESKTOP_DRIVE_TUNING,
    applied: z
      .array(z.strictObject({ placementId: NAME, tuning: DESKTOP_DRIVE_TUNING }).readonly())
      .readonly(),
    limits: DESKTOP_DRIVE_TUNING_LIMITS.nullable(),
  })
  .readonly();

export type DesktopDriveTuningState = z.infer<typeof DESKTOP_DRIVE_TUNING_STATE>;

export const DESKTOP_DRIVE_COMMAND = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('again') }),
    z.strictObject({ kind: z.literal('remount') }),
    z.strictObject({ kind: z.literal('clear-cache') }),
    z.strictObject({ kind: z.literal('cache'), cache: DESKTOP_DRIVE_CACHE }),
    z.strictObject({ kind: z.literal('tuning'), tuning: DESKTOP_DRIVE_TUNING }),
    z.strictObject({ kind: z.literal('pin'), mount: NAME, path: NAME }),
    z.strictObject({ kind: z.literal('unpin'), mount: NAME, path: NAME }),
    z.strictObject({ kind: z.literal('sync-pause') }),
    z.strictObject({ kind: z.literal('sync-resume') }),
  ])
  .readonly();

export type DesktopDriveCommand = z.infer<typeof DESKTOP_DRIVE_COMMAND>;

export const DESKTOP_DRIVE_FUSE_PARTS = ['/dev/fuse', 'fusermount3'] as const;

const FUSE = z.discriminatedUnion('available', [
  z.strictObject({ available: z.literal(true) }),
  z.strictObject({
    available: z.literal(false),
    missing: z.array(z.enum(DESKTOP_DRIVE_FUSE_PARTS)).readonly(),
    command: z.string().nullable(),
    reason: NAME,
  }),
]);

export type DesktopDriveFuse = z.infer<typeof FUSE>;

export const DESKTOP_DRIVE_SYNCING = z
  .strictObject({
    files: POSITIVE,
    bytes: COUNT,
    sentFiles: COUNT,
    sentBytes: COUNT,
    bytesPerSecond: z.number().nonnegative().nullable(),
  })
  .readonly();

export type DesktopDriveSyncing = z.infer<typeof DESKTOP_DRIVE_SYNCING>;

export function syncingProgress(syncing: DesktopDriveSyncing): number {
  const bytes = syncing.sentBytes + syncing.bytes;
  if (bytes > 0) return syncing.sentBytes / bytes;
  return syncing.sentFiles / (syncing.sentFiles + syncing.files);
}

export function syncingWords(syncing: DesktopDriveSyncing): string {
  const files = `${String(syncing.files)} ${syncing.files === 1 ? 'file' : 'files'}`;
  const size = syncing.bytes === 0 ? '' : ` (${formatBytes(syncing.bytes)})`;
  return `Syncing ${files}${size} to the Hub`;
}

function timeLeftOf(seconds: number): string {
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${String(minutes)} min`;
  return `about ${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

export function syncingSpeedWords(syncing: DesktopDriveSyncing): string | null {
  const rate = syncing.bytesPerSecond;
  if (rate === null || rate === 0) return null;
  return `${formatByteRate(rate)} · ${timeLeftOf(syncing.bytes / rate)} left`;
}

export const DESKTOP_DRIVE_ALL_ON_HUB = 'All changes are on the Hub';

export const DESKTOP_DRIVE_FOLDER_SYNCING = z
  .strictObject({
    placementId: NAME,
    name: NAME,
    files: POSITIVE,
    bytes: COUNT,
    sentFiles: COUNT,
    sentBytes: COUNT,
    bytesPerSecond: z.number().nonnegative().nullable(),
    current: NAME.nullable(),
  })
  .readonly();

export type DesktopDriveFolderSyncing = z.infer<typeof DESKTOP_DRIVE_FOLDER_SYNCING>;

export function folderSyncingWords(folder: DesktopDriveFolderSyncing): string {
  const files = `${String(folder.files)} ${folder.files === 1 ? 'file' : 'files'}`;
  const size = folder.bytes === 0 ? '' : ` (${formatBytes(folder.bytes)})`;
  return `Syncing ${files}${size} in ${folder.name}`;
}

export const DESKTOP_DRIVE_STATE = z
  .strictObject({
    mount: z
      .strictObject({
        status: NAME,
        mounted: z.boolean(),
        points: z.array(z.strictObject({ placementId: NAME, point: NAME }).readonly()).readonly(),
        syncing: DESKTOP_DRIVE_SYNCING.nullable(),
      })
      .nullable(),
    sync: z
      .strictObject({
        placements: COUNT,
        paused: z.boolean(),
        needBytes: COUNT,
        pendingOps: COUNT,
        failures: COUNT,
        folders: z.array(DESKTOP_DRIVE_FOLDER_SYNCING).readonly(),
      })
      .nullable(),
    fuse: FUSE,
    cache: DESKTOP_DRIVE_CACHE,
    tuning: DESKTOP_DRIVE_TUNING_STATE,
  })
  .readonly();

export type DesktopDriveState = z.infer<typeof DESKTOP_DRIVE_STATE>;

export const DESKTOP_DRIVE_CHANGED = 'desktop:drive-changed';

export interface DesktopDrive {
  state(): Promise<DesktopDriveState | null>;
  run(command: DesktopDriveCommand): Promise<DesktopDriveState>;
  open(placementId: string): Promise<void>;
  onChange(listener: (state: DesktopDriveState | null) => void): () => void;
}
