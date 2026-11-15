import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import {
  changeDrive,
  createDriveAlbum,
  removeDriveAlbum,
  updateDriveAlbum,
} from '../../../api/drive';
import type { DriveResult } from '../../../api/drive';
import { type DrivePages, flattenPages, useDriveAlbumItems, useDriveAlbums } from '../../drive';
import { changeBody, createBody, type AlbumDraft } from './rule-draft';

export function usePhotoAlbums(): readonly DriveAlbum[] {
  return useDriveAlbums('photos');
}

export function usePhotoAlbum(albumId: string | null): DriveAlbum | null {
  const albums = usePhotoAlbums();
  return albums.find((album) => album.id === albumId) ?? null;
}

export function usePhotoAlbumItems(albumId: string): DrivePages<DriveResult<'listAlbumItems'>> {
  return useDriveAlbumItems(albumId);
}

export interface LoadedItems {
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
}

export function loadedItems(pages: DrivePages<DriveResult<'listAlbumItems'>>): LoadedItems | null {
  if (pages.data === undefined) return null;
  return {
    items: flattenPages(pages.data, (page) => page.items),
    complete: !pages.hasNextPage,
  };
}

export async function createAlbum(draft: AlbumDraft): Promise<DriveAlbum> {
  const body = createBody(draft);
  if (body === null) throw new Error('The album needs a name and complete rules');
  return createDriveAlbum(body);
}

export async function saveAlbum(album: DriveAlbum, draft: AlbumDraft): Promise<DriveAlbum> {
  const body = changeBody(album, draft);
  if (body === null) throw new Error('The album needs a name and complete rules');
  return updateDriveAlbum(album.id, body);
}

export async function deleteAlbum(album: DriveAlbum): Promise<void> {
  await removeDriveAlbum(album.id);
}

export async function removeFromAlbum(
  album: DriveAlbum,
  itemIds: readonly string[],
): Promise<void> {
  const result = await changeDrive({ action: 'album_remove', albumId: album.id, itemIds });
  if (result.failed.length > 0) {
    throw new Error(
      `${String(result.failed.length)} of ${String(itemIds.length)} stayed in the album`,
    );
  }
}

export interface Removal {
  readonly owner: boolean;
  readonly me: string | null;
  readonly items: readonly DriveItem[];
}

export function removableIds(
  album: DriveAlbum,
  { owner, me, items }: Removal,
  ids: readonly string[],
): readonly string[] | null {
  if (album.kind === 'smart') return null;
  if (owner) return ids;
  const mine = new Set(
    items.filter((item) => me !== null && item.addedByProfileId === me).map((item) => item.id),
  );
  return ids.every((id) => mine.has(id)) ? ids : null;
}
