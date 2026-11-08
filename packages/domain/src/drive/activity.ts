import { z } from 'zod';
import { DRIVE_FEED_ROW } from './feed';
import { DRIVE_ITEM_KINDS } from './item';

export const DRIVE_ACTIVITY_ITEM = z
  .strictObject({
    kind: z.enum(DRIVE_ITEM_KINDS),
    name: z.string().min(1),
    parentId: z.uuid().nullable(),
    relPath: z.string().min(1),
  })
  .readonly();

export const DRIVE_ACTIVITY_ENTRY = z
  .strictObject({
    row: DRIVE_FEED_ROW,
    item: DRIVE_ACTIVITY_ITEM.nullable(),
  })
  .readonly();

export type DriveActivityEntry = z.infer<typeof DRIVE_ACTIVITY_ENTRY>;
