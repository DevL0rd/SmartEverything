import {
  LOCKED_TOKEN_HEADER,
  PHOTOS_ENDPOINTS as P,
  type DriveItemLink,
  type LibraryScope,
  type LockedPinSet,
  type PhotoMetaPatch,
} from '@smarteverything/domain';
import type { PhotosResult } from '../../../api/photos';
import { api } from '../../../api/transport';
import { routedDriveLinks } from '../../drive';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

function cursorQuery(cursor: string | null): { readonly cursor?: string } {
  return cursor === null ? {} : { cursor };
}

function tokenHeaders(token: string): Readonly<Record<string, string>> {
  return { [LOCKED_TOKEN_HEADER]: token };
}

export function editPhotoMeta(body: PhotoMetaPatch): Call<'editPhotoMeta'> {
  return api().call(P.editPhotoMeta, { body });
}

export function archivePhotos(itemIds: readonly string[]): Call<'archivePhotos'> {
  return api().call(P.archivePhotos, { body: { itemIds: [...itemIds] } });
}

export function unarchivePhotos(itemIds: readonly string[]): Call<'unarchivePhotos'> {
  return api().call(P.unarchivePhotos, { body: { itemIds: [...itemIds] } });
}

export function readPhotoArchived(itemId: string): Call<'readPhotoArchived'> {
  return api().call(P.readPhotoArchived, { params: { itemId } });
}

export function readArchiveBuckets(scope: LibraryScope): Call<'readArchiveBuckets'> {
  return api().call(P.readArchiveBuckets, { query: scope });
}

export function readArchivePage(
  month: string,
  scope: LibraryScope,
  cursor: string | null,
): Call<'readArchivePage'> {
  return api().call(P.readArchivePage, {
    params: { month },
    query: { ...scope, ...cursorQuery(cursor) },
  });
}

export function readLockedState(): Call<'readLockedState'> {
  return api().call(P.readLockedState, {});
}

export function setLockedPin(body: LockedPinSet): Call<'setLockedPin'> {
  return api().call(P.setLockedPin, { body });
}

export function unlockLockedFolder(pin: string): Call<'unlockLockedFolder'> {
  return api().call(P.unlockLockedFolder, { body: { pin } });
}

export function lockLockedFolder(token: string): Call<'lockLockedFolder'> {
  return api().call(P.lockLockedFolder, {}, { headers: tokenHeaders(token) });
}

export function readLockedBuckets(token: string, scope: LibraryScope): Call<'readLockedBuckets'> {
  return api().call(P.readLockedBuckets, { query: scope }, { headers: tokenHeaders(token) });
}

export function readLockedPage(
  token: string,
  month: string,
  scope: LibraryScope,
  cursor: string | null,
): Call<'readLockedPage'> {
  return api().call(
    P.readLockedPage,
    { params: { month }, query: { ...scope, ...cursorQuery(cursor) } },
    { headers: tokenHeaders(token) },
  );
}

export function readLockedLinks(
  token: string,
  itemIds: readonly string[],
): Promise<readonly DriveItemLink[]> {
  return routedDriveLinks((client) =>
    client.call(
      P.readLockedLinks,
      { body: { itemIds: [...itemIds] } },
      { headers: tokenHeaders(token) },
    ),
  );
}

export function moveIntoLockedFolder(itemIds: readonly string[]): Call<'moveIntoLockedFolder'> {
  return api().call(P.moveIntoLockedFolder, { body: { itemIds: [...itemIds] } });
}

export function moveOutOfLockedFolder(
  token: string,
  itemIds: readonly string[],
): Call<'moveOutOfLockedFolder'> {
  return api().call(
    P.moveOutOfLockedFolder,
    { body: { itemIds: [...itemIds] } },
    { headers: tokenHeaders(token) },
  );
}

export function deleteFromLockedFolder(
  token: string,
  itemIds: readonly string[],
): Call<'deleteFromLockedFolder'> {
  return api().call(
    P.deleteFromLockedFolder,
    { body: { itemIds: [...itemIds] } },
    { headers: tokenHeaders(token) },
  );
}
