import { z } from 'zod';

export const DESKTOP_PHOTO_ITEM = z.strictObject({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  modifiedAt: z.number().nonnegative(),
  takenAt: z.number().nonnegative(),
  uri: z.string().min(1),
  video: z.boolean(),
});
export type DesktopPhotoItem = z.infer<typeof DESKTOP_PHOTO_ITEM>;
export const DESKTOP_PHOTO_LIBRARY = z.strictObject({
  items: z.array(DESKTOP_PHOTO_ITEM).readonly(),
  issues: z.array(z.strictObject({ folder: z.string(), message: z.string() })).readonly(),
});
export type DesktopPhotoLibrary = z.infer<typeof DESKTOP_PHOTO_LIBRARY>;
export const DESKTOP_PHOTO_HASH_REQUEST = z.strictObject({
  id: DESKTOP_PHOTO_ITEM.shape.id,
  operation: z.string().min(1),
});
export const DESKTOP_PHOTO_HASH = z.strictObject({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().nonnegative(),
});
export const DESKTOP_PHOTOS_CHANGED = 'desktop:photos-changed';
export const DESKTOP_PHOTOS_CHARGING_CHANGED = 'desktop:photos-charging-changed';
export interface DesktopPhotos {
  list(): Promise<DesktopPhotoLibrary>;
  onChange(listener: () => void): () => void;
  hash(
    input: z.infer<typeof DESKTOP_PHOTO_HASH_REQUEST>,
  ): Promise<z.infer<typeof DESKTOP_PHOTO_HASH>>;
  cancel(operation: string): Promise<void>;
  charging(): Promise<boolean>;
  onChargingChange(listener: () => void): () => void;
}
