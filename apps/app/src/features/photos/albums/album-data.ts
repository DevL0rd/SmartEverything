import type { QueryClient } from '@tanstack/react-query';
import type { DriveAlbum, DriveAlbumChange, DriveChange, DriveItem } from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { changeDrive, removeDriveAlbum, updateDriveAlbum } from '../../../api/drive';
import type { DriveResult } from '../../../api/drive';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import {
  type DrivePages,
  flattenPages,
  useDriveAlbumItems,
  useDriveAlbums,
  createAlbumShown,
  type AlbumCreate,
  editOfChange,
  writeDriveShown,
} from '../../drive';
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

export interface StartedAlbum {
  readonly id: string;
  readonly title: string;
  readonly saved: Promise<DriveAlbum>;
}

export function startAlbum(
  store: EntityStore,
  client: QueryClient,
  draft: AlbumDraft,
  itemIds: readonly string[],
): StartedAlbum {
  const body = createBody(draft);
  if (body === null) throw new Error('The album needs a name and complete rules');
  const id = randomUUID();
  const create: AlbumCreate = body.kind === 'manual' ? { ...body, id, itemIds } : { ...body, id };
  return { id, title: body.title, saved: createAlbumShown(store, client, create) };
}

export function albumAfter(album: DriveAlbum, body: DriveAlbumChange): DriveAlbum {
  const changed = {
    ...(body.title === undefined ? {} : { title: body.title }),
    ...(body.coverItemId === undefined ? {} : { coverItemId: body.coverItemId }),
  };
  if (album.kind === 'manual') return { ...album, ...changed };
  return { ...album, ...changed, ...(body.rule === undefined ? {} : { rule: body.rule }) };
}

export function saveAlbum(
  store: EntityStore,
  album: DriveAlbum,
  draft: AlbumDraft,
): Promise<DriveAlbum> {
  const body = changeBody(album, draft);
  if (body === null) return Promise.reject(new Error('The album needs a name and complete rules'));
  return writeOptimistically(store, {
    event: 'photos.album_save',
    edits: [liveRowEdit('drive_albums', album.id, album, albumAfter(album, body))],
    send: () => updateDriveAlbum(album.id, body),
    fields: { albumId: album.id },
  });
}

export async function deleteAlbum(store: EntityStore, album: DriveAlbum): Promise<void> {
  await writeOptimistically(store, {
    event: 'photos.album_delete',
    edits: [liveRowEdit('drive_albums', album.id, album, null)],
    send: () => removeDriveAlbum(album.id),
    fields: { albumId: album.id },
  });
}

export function removeFromAlbum(
  client: QueryClient,
  album: DriveAlbum,
  itemIds: readonly string[],
): Promise<void> {
  const body: DriveChange = { action: 'album_remove', albumId: album.id, itemIds };
  return writeDriveShown(client, {
    event: 'photos.album_remove',
    edit: editOfChange(body),
    send: async () => {
      const result = await changeDrive(body);
      if (result.failed.length > 0) {
        throw new Error(
          `${String(result.failed.length)} of ${String(itemIds.length)} stayed in the album`,
        );
      }
    },
    incomplete: () => false,
  });
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
