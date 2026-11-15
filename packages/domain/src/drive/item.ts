import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().nonnegative();
const SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const DRIVE_ITEM_KINDS = [
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'other',
  'link',
  'special',
] as const;

export const DRIVE_FOLDER_COLOURS = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
  'viz-7',
  'viz-8',
] as const;

export const DRIVE_FOLDER_COLOUR = z.enum(DRIVE_FOLDER_COLOURS);

export type DriveFolderColour = z.infer<typeof DRIVE_FOLDER_COLOUR>;

export const DRIVE_INTEGRITY = ['unknown', 'ok', 'corrupt'] as const;

export type DriveIntegrity = (typeof DRIVE_INTEGRITY)[number];

export const DRIVE_THUMB = z
  .discriminatedUnion('state', [
    z.strictObject({ state: z.literal('none') }),
    z.strictObject({ state: z.literal('ready') }),
    z.strictObject({ state: z.literal('failed'), reason: z.string().min(1) }),
    z.strictObject({ state: z.literal('unsupported'), reason: z.string().min(1) }),
  ])
  .readonly();

export type DriveThumb = z.infer<typeof DRIVE_THUMB>;

export const DRIVE_CAMERA = z
  .strictObject({
    make: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    lens: z.string().min(1).nullable(),
  })
  .readonly();

export const DRIVE_EXPOSURE = z
  .strictObject({
    iso: z.number().positive().nullable(),
    aperture: z.number().positive().nullable(),
    shutter: z.number().positive().nullable(),
    focal: z.number().positive().nullable(),
  })
  .readonly();

const PLACE = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

const BASE = {
  id: ID,
  rootId: ID,
  parentId: ID.nullable(),
  relPath: z.string().min(1),
  name: z.string().min(1),
  modifiedAt: MOMENT,
  addedAt: MOMENT,
  openedAt: MOMENT.nullable().describe('When the viewer last opened it; never another person’s'),
  starred: z.boolean(),
  shared: z.boolean(),
  locked: z
    .boolean()
    .describe('View only: the item or a folder above it blocks downloads and copies for viewers'),
  lockedHere: z
    .boolean()
    .describe('View only is set on this item itself; false when it comes only from a folder above'),
  openComments: COUNT.describe('Unresolved comment threads'),
  rev: z.int().positive(),
  etag: z.string().min(1),
  outside: z.boolean(),
  addedByProfileId: ID.nullable(),
  remoteId: z.string().min(1).nullable(),
  remoteRev: z.string().min(1).nullable(),
};

const FILE = {
  ...BASE,
  mime: z.string().min(1),
  bytes: COUNT,
  sha256: SHA256.nullable(),
  integrity: z.enum(DRIVE_INTEGRITY),
  thumb: DRIVE_THUMB,
};

const MEDIA = {
  takenAt: MOMENT.nullable(),
  width: z.int().positive().nullable(),
  height: z.int().positive().nullable(),
  orientation: z.int().min(1).max(8).nullable(),
  camera: DRIVE_CAMERA.nullable(),
  exposure: DRIVE_EXPOSURE.nullable(),
  place: PLACE.nullable(),
};

export const DRIVE_ITEM = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...BASE,
      kind: z.literal('folder'),
      childCount: COUNT,
      bytes: COUNT,
      colour: DRIVE_FOLDER_COLOUR.nullable().describe('The viewer’s own colour for the folder'),
      iconHint: z.boolean().describe('The folder holds an icon file the folder glyph shows'),
    }),
    z.strictObject({ ...FILE, ...MEDIA, kind: z.literal('image') }),
    z.strictObject({
      ...FILE,
      ...MEDIA,
      kind: z.literal('video'),
      durationMs: COUNT.nullable(),
    }),
    z.strictObject({
      ...FILE,
      kind: z.literal('audio'),
      takenAt: MOMENT.nullable(),
      durationMs: COUNT.nullable(),
    }),
    z.strictObject({ ...FILE, kind: z.literal('document') }),
    z.strictObject({ ...FILE, kind: z.literal('other') }),
    z.strictObject({
      ...BASE,
      kind: z.literal('link'),
      bytes: COUNT,
      linkTarget: z.string().min(1),
    }),
    z.strictObject({ ...BASE, kind: z.literal('special'), bytes: COUNT }),
  ])
  .readonly();

export type DriveItem = z.infer<typeof DRIVE_ITEM>;

export const DRIVE_FOLDER_COLOUR_SET = z
  .strictObject({ itemId: ID, colour: DRIVE_FOLDER_COLOUR.nullable() })
  .readonly();

export type DriveFolderColourSet = z.infer<typeof DRIVE_FOLDER_COLOUR_SET>;

export const DRIVE_LOCK_SET = z.strictObject({ itemId: ID, locked: z.boolean() }).readonly();

export type DriveLockSet = z.infer<typeof DRIVE_LOCK_SET>;
