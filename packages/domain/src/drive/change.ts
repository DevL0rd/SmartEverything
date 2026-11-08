import { z } from 'zod';

const ID = z.uuid();

const NAME = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !name.includes('/') && !name.includes('\0'), {
    message: 'a name has no slash and no NUL',
  })
  .refine((name) => name !== '.' && name !== '..', {
    message: 'a name is not a dot entry',
  });

const IDS = z.array(ID).min(1).readonly();

export const DRIVE_CHANGE_ACTIONS = [
  'new_folder',
  'rename',
  'move',
  'copy',
  'star',
  'unstar',
  'trash',
  'restore',
  'delete_now',
  'album_add',
  'album_remove',
  'keep_source_item',
] as const;

export type DriveChangeAction = (typeof DRIVE_CHANGE_ACTIONS)[number];

export const DRIVE_CHANGE = z
  .discriminatedUnion('action', [
    z.strictObject({ action: z.literal('new_folder'), parentId: ID, name: NAME }),
    z.strictObject({ action: z.literal('rename'), itemId: ID, name: NAME }),
    z.strictObject({ action: z.literal('move'), itemIds: IDS, toFolderId: ID }),
    z.strictObject({ action: z.literal('copy'), itemIds: IDS, toFolderId: ID }),
    z.strictObject({ action: z.literal('star'), itemIds: IDS }),
    z.strictObject({ action: z.literal('unstar'), itemIds: IDS }),
    z.strictObject({ action: z.literal('trash'), itemIds: IDS }),
    z.strictObject({ action: z.literal('restore'), itemIds: IDS }),
    z.strictObject({ action: z.literal('delete_now'), itemIds: IDS }),
    z.strictObject({ action: z.literal('album_add'), albumId: ID, itemIds: IDS }),
    z.strictObject({ action: z.literal('album_remove'), albumId: ID, itemIds: IDS }),
    z.strictObject({ action: z.literal('keep_source_item'), itemId: ID, toFolderId: ID }),
  ])
  .readonly();

export type DriveChange = z.infer<typeof DRIVE_CHANGE>;

export const DRIVE_CHANGE_RESULT = z
  .strictObject({
    done: z
      .array(z.strictObject({ itemId: ID, resultItemId: ID.nullable() }).readonly())
      .readonly(),
    failed: z
      .array(z.strictObject({ itemId: ID.nullable(), reason: z.string().min(1) }).readonly())
      .readonly(),
    conflicts: z
      .array(
        z
          .strictObject({
            itemId: ID.nullable(),
            name: z.string().min(1),
            existingItemId: ID,
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type DriveChangeResult = z.infer<typeof DRIVE_CHANGE_RESULT>;
