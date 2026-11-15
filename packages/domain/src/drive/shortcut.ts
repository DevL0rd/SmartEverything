import { z } from 'zod';
import { DRIVE_ITEM } from './item';
import { DRIVE_FOLDER_PLACE } from './upload';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const DRIVE_SHORTCUT_UNAVAILABLE_REASONS = ['no_access', 'trashed'] as const;

export type DriveShortcutUnavailableReason = (typeof DRIVE_SHORTCUT_UNAVAILABLE_REASONS)[number];

export const DRIVE_SHORTCUT_TARGET = z
  .discriminatedUnion('state', [
    z.strictObject({ state: z.literal('available'), item: DRIVE_ITEM }),
    z.strictObject({
      state: z.literal('unavailable'),
      reason: z.enum(DRIVE_SHORTCUT_UNAVAILABLE_REASONS),
    }),
  ])
  .readonly();

export type DriveShortcutTarget = z.infer<typeof DRIVE_SHORTCUT_TARGET>;

export const DRIVE_SHORTCUT = z
  .strictObject({
    id: ID,
    rootId: ID,
    parentId: ID.nullable(),
    name: z.string().trim().min(1),
    createdBy: ID,
    createdAt: MOMENT,
    target: DRIVE_SHORTCUT_TARGET,
  })
  .readonly();

export type DriveShortcut = z.infer<typeof DRIVE_SHORTCUT>;

export const DRIVE_SHORTCUT_CREATE = z
  .strictObject({
    targetItemId: ID,
    place: DRIVE_FOLDER_PLACE,
    name: z.string().trim().min(1),
  })
  .readonly();

export type DriveShortcutCreate = z.infer<typeof DRIVE_SHORTCUT_CREATE>;
