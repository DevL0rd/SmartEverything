import {
  PHOTOS_ENDPOINTS as P,
  type PhotoGroupKind,
  type PhotoGroupMerge,
  type PhotoGroupUpdate,
} from '@smarteverything/domain';
import type { PhotosResult } from '../../../api/photos';
import { api } from '../../../api/transport';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export function listPhotoGroups(
  kind: PhotoGroupKind | null,
  signal: AbortSignal,
): Call<'listPhotoGroups'> {
  return api().call(P.listPhotoGroups, { query: kind === null ? {} : { kind } }, { signal });
}

export function readPhotoGroup(groupId: string, signal: AbortSignal): Call<'readPhotoGroup'> {
  return api().call(P.readPhotoGroup, { params: { groupId } }, { signal });
}

export function updatePhotoGroup(
  groupId: string,
  body: PhotoGroupUpdate,
): Call<'updatePhotoGroup'> {
  return api().call(P.updatePhotoGroup, { params: { groupId }, body });
}

export function mergePhotoGroups(body: PhotoGroupMerge): Call<'mergePhotoGroups'> {
  return api().call(P.mergePhotoGroups, { body });
}

export function dismissPhotoMergeSuggestion(
  groupIds: readonly [string, string],
): Call<'dismissPhotoMergeSuggestion'> {
  return api().call(P.dismissPhotoMergeSuggestion, { body: { groupIds: [...groupIds] } });
}

export function removePhotoGroupFaces(
  groupId: string,
  faceIds: readonly string[],
): Call<'removePhotoGroupFaces'> {
  return api().call(P.removePhotoGroupFaces, {
    params: { groupId },
    body: { faceIds: [...faceIds] },
  });
}

export function readPhotoFaces(
  itemId: string,
  request: { readonly signal?: AbortSignal } = {},
): Call<'readPhotoFaces'> {
  return api().call(P.readPhotoFaces, { params: { itemId } }, request);
}

export async function facesOfGroupIn(
  groupId: string,
  itemIds: readonly string[],
): Promise<readonly string[]> {
  const found = await Promise.all(itemIds.map((itemId) => readPhotoFaces(itemId)));
  return found.flatMap((item) =>
    item.faces.filter((face) => face.groupId === groupId).map((face) => face.id),
  );
}
