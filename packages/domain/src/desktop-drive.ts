import { z } from 'zod';

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

export const DESKTOP_DRIVE_COMMAND = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('again') }),
    z.strictObject({ kind: z.literal('clear-cache') }),
    z.strictObject({ kind: z.literal('cache'), cache: DESKTOP_DRIVE_CACHE }),
    z.strictObject({ kind: z.literal('pin'), mount: NAME, path: NAME }),
    z.strictObject({ kind: z.literal('unpin'), mount: NAME, path: NAME }),
    z.strictObject({ kind: z.literal('sync-pause') }),
    z.strictObject({ kind: z.literal('sync-resume') }),
    z.strictObject({ kind: z.literal('first-run-mounted') }),
    z.strictObject({ kind: z.literal('first-run-dismissed') }),
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

export const DESKTOP_DRIVE_STATE = z
  .strictObject({
    mount: z.strictObject({ status: NAME, mounted: z.boolean() }).nullable(),
    sync: z
      .strictObject({
        placements: COUNT,
        paused: z.boolean(),
        needBytes: COUNT,
        pendingOps: COUNT,
        failures: COUNT,
      })
      .nullable(),
    fuse: FUSE,
    firstRun: z.strictObject({ pending: z.boolean(), defaultParent: NAME }),
    cache: DESKTOP_DRIVE_CACHE,
  })
  .readonly();

export type DesktopDriveState = z.infer<typeof DESKTOP_DRIVE_STATE>;

export const DESKTOP_DRIVE_CHANGED = 'desktop:drive-changed';

export interface DesktopDrive {
  state(): Promise<DesktopDriveState | null>;
  run(command: DesktopDriveCommand): Promise<DesktopDriveState>;
  onChange(listener: (state: DesktopDriveState | null) => void): () => void;
}
