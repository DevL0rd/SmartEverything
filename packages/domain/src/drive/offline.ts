import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_OFFLINE_STATES = ['waiting', 'ready', 'failed'] as const;

export type DriveOfflineState = (typeof DRIVE_OFFLINE_STATES)[number];

export const DRIVE_OFFLINE_ITEM = z
  .strictObject({
    clientId: ID,
    itemId: ID,
    profileId: ID,
    state: z.enum(DRIVE_OFFLINE_STATES),
    bytes: COUNT,
    syncedRev: z.int().positive().nullable(),
    error: z.string().min(1).nullable(),
    updatedAt: MOMENT,
  })
  .refine((row) => (row.state === 'failed') === (row.error !== null), {
    message: 'only a failed item carries an error',
    path: ['error'],
  })
  .refine((row) => row.state !== 'ready' || row.syncedRev !== null, {
    message: 'a ready item has a synced revision',
    path: ['syncedRev'],
  })
  .readonly();

export type DriveOfflineItem = z.infer<typeof DRIVE_OFFLINE_ITEM>;

export const DRIVE_OFFLINE_SET = z
  .strictObject({ clientId: ID, itemId: ID, on: z.boolean() })
  .readonly();

export type DriveOfflineSet = z.infer<typeof DRIVE_OFFLINE_SET>;

export const DRIVE_OFFLINE_REPORT_ENTRY = z
  .discriminatedUnion('state', [
    z.strictObject({
      itemId: ID,
      state: z.literal('ready'),
      bytes: COUNT,
      rev: z.int().positive(),
    }),
    z.strictObject({ itemId: ID, state: z.literal('failed'), error: z.string().min(1) }),
  ])
  .readonly();

export type DriveOfflineReportEntry = z.infer<typeof DRIVE_OFFLINE_REPORT_ENTRY>;

export const DRIVE_OFFLINE_REPORT = z
  .strictObject({ clientId: ID, items: z.array(DRIVE_OFFLINE_REPORT_ENTRY).min(1).readonly() })
  .readonly();

export type DriveOfflineReport = z.infer<typeof DRIVE_OFFLINE_REPORT>;

export const DRIVE_OFFLINE_CHANGED_PAYLOAD = z
  .strictObject({ itemIds: z.array(ID).min(1).readonly() })
  .readonly();

export type DriveOfflineChangedPayload = z.infer<typeof DRIVE_OFFLINE_CHANGED_PAYLOAD>;
