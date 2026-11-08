import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_TRASH_ENTRY = z
  .strictObject({
    itemId: ID,
    rootId: ID,
    name: z.string().min(1),
    originalRelPath: z.string().min(1),
    trashRelPath: z.string().min(1),
    isFolder: z.boolean(),
    bytes: z.int().nonnegative(),
    deletedAt: MOMENT,
    purgeAt: MOMENT,
    deletedBy: ID.nullable(),
    addedByProfileId: ID.nullable(),
  })
  .refine((entry) => Date.parse(entry.purgeAt) > Date.parse(entry.deletedAt), {
    message: 'purgeAt must be after deletedAt',
    path: ['purgeAt'],
  })
  .readonly();

export type DriveTrashEntry = z.infer<typeof DRIVE_TRASH_ENTRY>;
