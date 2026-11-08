import type { DriveAlbum, DriveItem } from '@smarteverything/domain';
import { createDriveAlbum, removeDriveAlbum, updateDriveAlbum } from '../../../api/drive';
import type { DriveResult } from '../../../api/drive';
import { useDriveAlbumItems } from '../../nas/data/queries';
import { flattenPages, type DrivePages } from '../../nas/data/pages';
import { useDriveAlbums } from '../../nas/data/tables';
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
