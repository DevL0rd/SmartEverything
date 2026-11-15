import { z } from 'zod';
import { COUNT, ID, LATITUDE, LONGITUDE, MOMENT, NAME } from './shared';

export const LOCKED_TOKEN_HEADER = 'x-photos-locked-token';

export const PHOTO_ITEM_IDS = z.strictObject({ itemIds: z.array(ID).min(1) });

export type PhotoItemIds = z.infer<typeof PHOTO_ITEM_IDS>;

export const PHOTO_ITEMS_CHANGED = z.strictObject({ count: COUNT }).readonly();

export const PHOTO_DATE_EDIT = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('set'), takenAt: MOMENT }),
  z.strictObject({ kind: z.literal('shift'), minutes: z.int().refine((value) => value !== 0) }),
]);

export type PhotoDateEdit = z.infer<typeof PHOTO_DATE_EDIT>;

export const PHOTO_LOCATION_EDIT = z.strictObject({
  latitude: LATITUDE,
  longitude: LONGITUDE,
  label: NAME.nullable(),
});

export type PhotoLocationEdit = z.infer<typeof PHOTO_LOCATION_EDIT>;

export const PHOTO_META_PATCH = z
  .strictObject({
    itemIds: z.array(ID).min(1),
    date: PHOTO_DATE_EDIT.optional(),
    location: PHOTO_LOCATION_EDIT.nullable().optional(),
  })
  .refine((patch) => patch.date !== undefined || patch.location !== undefined, {
    message: 'change the date, the location or both',
    path: ['date'],
  });

export type PhotoMetaPatch = z.infer<typeof PHOTO_META_PATCH>;

const PIN = z.string().regex(/^\d{4,}$/, 'a PIN is at least four digits');

export const LOCKED_PIN_SET = z.strictObject({ pin: PIN, currentPin: PIN.nullable() });

export type LockedPinSet = z.infer<typeof LOCKED_PIN_SET>;

export const LOCKED_UNLOCK = z.strictObject({ pin: PIN });

export const LOCKED_UNLOCKED = z
  .strictObject({ token: z.string().min(1), expiresAt: MOMENT })
  .readonly();

export type LockedUnlocked = z.infer<typeof LOCKED_UNLOCKED>;

export const LOCKED_STATE = z.strictObject({ configured: z.boolean() }).readonly();

export type LockedState = z.infer<typeof LOCKED_STATE>;

export const PHOTO_ARCHIVED = z.strictObject({ archived: z.boolean() }).readonly();

export type PhotoArchived = z.infer<typeof PHOTO_ARCHIVED>;
