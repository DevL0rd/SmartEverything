import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();

export const DRIVE_VIA = [
  'app',
  'ai',
  'automation',
  'mount',
  'sync',
  'scan',
  'share',
  'outside',
] as const;

export type DriveVia = (typeof DRIVE_VIA)[number];

export const DRIVE_FEED_OPS = [
  'create',
  'update',
  'rename',
  'move',
  'star',
  'unstar',
  'trash',
  'restore',
  'delete',
] as const;

export type DriveFeedOp = (typeof DRIVE_FEED_OPS)[number];

export const DRIVE_FEED_ROW = z
  .strictObject({
    seq: z.int().positive(),
    rootId: ID,
    itemId: ID,
    op: z.enum(DRIVE_FEED_OPS),
    rev: z.int().positive(),
    at: MOMENT,
    actorProfileId: ID.nullable(),
    via: z.enum(DRIVE_VIA),
    deviceId: ID.nullable(),
  })
  .superRefine((row, context) => {
    if ((row.via === 'scan' || row.via === 'outside') && row.actorProfileId !== null) {
      context.addIssue({
        code: 'custom',
        message: 'a scan or an outside change has no acting person',
        path: ['actorProfileId'],
      });
    }
    if ((row.via === 'mount' || row.via === 'sync') && row.deviceId === null) {
      context.addIssue({
        code: 'custom',
        message: 'a mount or sync change names its device',
        path: ['deviceId'],
      });
    }
  })
  .readonly();

export type DriveFeedRow = z.infer<typeof DRIVE_FEED_ROW>;

export const DRIVE_FEED_PAGE = z
  .strictObject({
    indexId: z.string().min(1),
    rows: z.array(DRIVE_FEED_ROW).readonly(),
    cursor: COUNT,
  })
  .readonly();

export type DriveFeedPage = z.infer<typeof DRIVE_FEED_PAGE>;
