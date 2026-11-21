import { z } from 'zod';
import { somethingToChange } from '../api/primitives';
import { SMART_RULE } from './smart-rule';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const TITLE = z.string().trim().min(1);

export const DRIVE_ALBUM_SCOPES = ['home', 'person'] as const;
export const DRIVE_ALBUM_SURFACES = ['photos', 'drive'] as const;

export type DriveAlbumSurface = (typeof DRIVE_ALBUM_SURFACES)[number];

const ALBUM_BASE = {
  id: ID,
  title: TITLE,
  surface: z.enum(DRIVE_ALBUM_SURFACES),
  scope: z.enum(DRIVE_ALBUM_SCOPES),
  ownerProfileId: ID.nullable(),
  coverItemId: ID.nullable(),
  itemCount: z.int().nonnegative(),
  createdAt: MOMENT,
  updatedAt: MOMENT,
};

export const DRIVE_ALBUM = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...ALBUM_BASE, kind: z.literal('manual') }),
    z.strictObject({ ...ALBUM_BASE, kind: z.literal('smart'), rule: SMART_RULE }),
  ])
  .refine((album) => (album.scope === 'person') === (album.ownerProfileId !== null), {
    message: 'a person album needs an owner and a home album has none',
    path: ['ownerProfileId'],
  })
  .readonly();

export type DriveAlbum = z.infer<typeof DRIVE_ALBUM>;

export const DRIVE_ALBUM_CREATE = z
  .discriminatedUnion('kind', [
    z.strictObject({
      id: ID.optional().describe('Id the client generated for the new album'),
      kind: z.literal('manual'),
      title: TITLE,
      surface: z.enum(DRIVE_ALBUM_SURFACES),
      scope: z.enum(DRIVE_ALBUM_SCOPES),
      itemIds: z.array(ID).readonly(),
    }),
    z.strictObject({
      id: ID.optional().describe('Id the client generated for the new album'),
      kind: z.literal('smart'),
      title: TITLE,
      surface: z.enum(DRIVE_ALBUM_SURFACES),
      scope: z.enum(DRIVE_ALBUM_SCOPES),
      rule: SMART_RULE,
    }),
  ])
  .readonly();

export type DriveAlbumCreate = z.infer<typeof DRIVE_ALBUM_CREATE>;

export const DRIVE_ALBUM_CHANGE = somethingToChange({
  title: TITLE,
  coverItemId: ID.nullable(),
  rule: SMART_RULE,
});

export type DriveAlbumChange = z.infer<typeof DRIVE_ALBUM_CHANGE>;
