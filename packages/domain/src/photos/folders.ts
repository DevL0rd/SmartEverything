import { z } from 'zod';
import { COUNT, ID, MOMENT, NAME } from './shared';

export const PHOTO_FOLDER_KINDS = ['drive', 'phone', 'computer'] as const;

export type PhotoFolderKind = (typeof PHOTO_FOLDER_KINDS)[number];

export const PHOTO_FOLDER_SHOWS = ['visible', 'all'] as const;

export type PhotoFolderShow = (typeof PHOTO_FOLDER_SHOWS)[number];

const KEY_PATTERN = /^(drive|phone|computer):\S(.*\S)?$/;

export const PHOTO_FOLDER_KEY = z.string().regex(KEY_PATTERN, 'a folder key is kind:place');

export type PhotoFolderKey = z.infer<typeof PHOTO_FOLDER_KEY>;

export function photoFolderKey(kind: PhotoFolderKind, place: string): PhotoFolderKey {
  return PHOTO_FOLDER_KEY.parse(`${kind}:${place}`);
}

export function photoFolderKindOf(key: PhotoFolderKey): PhotoFolderKind {
  const kind = PHOTO_FOLDER_KINDS.find((candidate) => key.startsWith(`${candidate}:`));
  if (kind === undefined) throw new TypeError(`${key} is not a photo folder key`);
  return kind;
}

export function photoFolderPlaceOf(key: PhotoFolderKey): string {
  return key.slice(photoFolderKindOf(key).length + 1);
}

export function phoneFolderPath(relativePath: string): string | null {
  const path = relativePath.replace(/\/+$/, '');
  return path.length === 0 ? null : path;
}

export const PHOTO_FOLDER_ORIGIN = z
  .strictObject({ key: PHOTO_FOLDER_KEY, name: NAME })
  .refine((origin) => photoFolderKindOf(origin.key) !== 'drive', {
    message: 'a backup comes from a phone album or a computer folder',
    path: ['key'],
  })
  .readonly();

export type PhotoFolderOrigin = z.infer<typeof PHOTO_FOLDER_ORIGIN>;

export const PHOTO_FOLDER = z
  .strictObject({
    key: PHOTO_FOLDER_KEY,
    kind: z.enum(PHOTO_FOLDER_KINDS),
    name: NAME,
    place: NAME,
    count: COUNT,
    coverItemId: ID.nullable(),
    coverRev: z.int().positive().nullable(),
    latestAt: MOMENT.nullable(),
    hidden: z.boolean(),
  })
  .readonly();

export type PhotoFolder = z.infer<typeof PHOTO_FOLDER>;

export const PHOTO_FOLDERS = z
  .strictObject({ folders: z.array(PHOTO_FOLDER).readonly() })
  .readonly();

export type PhotoFolders = z.infer<typeof PHOTO_FOLDERS>;

export const PHOTO_HIDDEN_FOLDER = z
  .strictObject({
    key: PHOTO_FOLDER_KEY,
    kind: z.enum(PHOTO_FOLDER_KINDS),
    name: NAME,
    hiddenAt: MOMENT,
  })
  .readonly();

export type PhotoHiddenFolder = z.infer<typeof PHOTO_HIDDEN_FOLDER>;

export const PHOTO_HIDDEN_FOLDERS = z
  .strictObject({ folders: z.array(PHOTO_HIDDEN_FOLDER).readonly() })
  .readonly();

export type PhotoHiddenFolders = z.infer<typeof PHOTO_HIDDEN_FOLDERS>;

export const PHOTO_FOLDER_HIDE = z
  .strictObject({ key: PHOTO_FOLDER_KEY, name: NAME, hidden: z.boolean() })
  .readonly();

export type PhotoFolderHide = z.infer<typeof PHOTO_FOLDER_HIDE>;

export const PHOTOS_FOLDERS_NOTICE = z.strictObject({
  type: z.literal('photos_folders_changed'),
  profileId: ID,
});

export type PhotosFoldersNotice = z.infer<typeof PHOTOS_FOLDERS_NOTICE>;
