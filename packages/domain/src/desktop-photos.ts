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
  folder: z.string().min(1),
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
export const DESKTOP_PHOTO_TRASH_REQUEST = z.array(DESKTOP_PHOTO_ITEM.shape.id).min(1).readonly();
export const DESKTOP_PHOTO_TRASHED = z.strictObject({
  trashed: z.array(DESKTOP_PHOTO_ITEM.shape.id).readonly(),
});
export type DesktopPhotoTrashed = z.infer<typeof DESKTOP_PHOTO_TRASHED>;
export const DESKTOP_PHOTOS_CHANGED = 'desktop:photos-changed';
export const DESKTOP_PHOTOS_CHARGING_CHANGED = 'desktop:photos-charging-changed';
export interface DesktopPhotos {
  list(): Promise<DesktopPhotoLibrary>;
  onChange(listener: () => void): () => void;
  hash(
    input: z.infer<typeof DESKTOP_PHOTO_HASH_REQUEST>,
  ): Promise<z.infer<typeof DESKTOP_PHOTO_HASH>>;
  cancel(operation: string): Promise<void>;
  trash(ids: readonly string[]): Promise<DesktopPhotoTrashed>;
  charging(): Promise<boolean>;
  onChargingChange(listener: () => void): () => void;
}
export interface DesktopPhotoChannels {
  readonly 'desktop:photos-list': {
    readonly request: undefined;
    readonly response: DesktopPhotoLibrary;
  };
  readonly 'desktop:photos-hash': {
    readonly request: z.infer<typeof DESKTOP_PHOTO_HASH_REQUEST>;
    readonly response: z.infer<typeof DESKTOP_PHOTO_HASH>;
  };
  readonly 'desktop:photos-cancel': { readonly request: string; readonly response: undefined };
  readonly 'desktop:photos-trash': {
    readonly request: readonly string[];
    readonly response: DesktopPhotoTrashed;
  };
  readonly 'desktop:photos-charging': { readonly request: undefined; readonly response: boolean };
}
