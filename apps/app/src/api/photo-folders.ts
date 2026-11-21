import { PHOTOS_ENDPOINTS as P, type PhotoFolderHide } from '@smarteverything/domain';
import type { PhotosResult } from './photos';
import { api } from './transport';

export function listPhotoFolders(signal: AbortSignal): Promise<PhotosResult<'listPhotoFolders'>> {
  return api().call(P.listPhotoFolders, {}, { signal });
}

export function listHiddenPhotoFolders(
  signal: AbortSignal,
): Promise<PhotosResult<'listHiddenPhotoFolders'>> {
  return api().call(P.listHiddenPhotoFolders, {}, { signal });
}

export function setPhotoFolderHidden(
  body: PhotoFolderHide,
): Promise<PhotosResult<'setPhotoFolderHidden'>> {
  return api().call(P.setPhotoFolderHidden, { body });
}
