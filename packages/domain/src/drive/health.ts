import { z } from 'zod';
import { DRIVE_DATA_SPACE } from './root';

const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();
const SHARE = z.number().min(0).max(1);

export const DRIVE_WATCHER_STATES = ['watching', 'reconciling', 'unavailable'] as const;

export type DriveWatcherState = (typeof DRIVE_WATCHER_STATES)[number];

export const DRIVE_SCRUB_STATE = z
  .discriminatedUnion('state', [
    z.strictObject({
      state: z.literal('idle'),
      lastFinishedAt: MOMENT.nullable(),
      corrupt: COUNT,
    }),
    z.strictObject({
      state: z.literal('running'),
      startedAt: MOMENT,
      checked: COUNT,
      total: COUNT,
      corrupt: COUNT,
    }),
    z.strictObject({
      state: z.literal('stopped'),
      startedAt: MOMENT,
      checked: COUNT,
      total: COUNT,
      corrupt: COUNT,
    }),
  ])
  .refine((scrub) => scrub.state === 'idle' || scrub.checked <= scrub.total, {
    message: 'checked cannot pass total',
    path: ['checked'],
  })
  .readonly();

export type DriveScrubState = z.infer<typeof DRIVE_SCRUB_STATE>;

export const DRIVE_BACKUP_REPORT_INPUT = z
  .strictObject({ reporter: z.string().min(1), bytes: COUNT, ok: z.boolean() })
  .readonly();

export type DriveBackupReportInput = z.infer<typeof DRIVE_BACKUP_REPORT_INPUT>;

export const DRIVE_BACKUP_REPORT = z
  .strictObject({ at: MOMENT, reporter: z.string().min(1), bytes: COUNT, ok: z.boolean() })
  .readonly();

export type DriveBackupReport = z.infer<typeof DRIVE_BACKUP_REPORT>;

export const DRIVE_BACKUP_STATUS = z
  .strictObject({
    last: DRIVE_BACKUP_REPORT.nullable(),
    lastOkAt: MOMENT.nullable(),
  })
  .readonly();

export type DriveBackupStatus = z.infer<typeof DRIVE_BACKUP_STATUS>;

export const DRIVE_HEALTH = z
  .strictObject({
    hashedShare: SHARE,
    verifiedShare: SHARE,
    corrupt: COUNT,
    rootsTotal: COUNT,
    rootsUnavailable: COUNT,
    watcher: z.enum(DRIVE_WATCHER_STATES),
    space: DRIVE_DATA_SPACE,
    scrub: DRIVE_SCRUB_STATE,
    backup: DRIVE_BACKUP_STATUS,
  })
  .refine((health) => health.rootsUnavailable <= health.rootsTotal, {
    message: 'unavailable drives cannot exceed all drives',
    path: ['rootsUnavailable'],
  })
  .readonly();

export type DriveHealth = z.infer<typeof DRIVE_HEALTH>;
