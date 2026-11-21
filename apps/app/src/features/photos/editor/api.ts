import {
  PHOTOS_ENDPOINTS as P,
  type PhotoEditSave,
  type PhotoErase,
  type VideoEdit,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { PhotosResult } from '../../../api/photos';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export function readPhotoEdit(itemId: string, signal: AbortSignal): Call<'readPhotoEdit'> {
  return api().call(P.readPhotoEdit, { params: { itemId } }, { signal });
}

export function readPhotoEditBase(itemId: string, signal: AbortSignal): Call<'readPhotoEditBase'> {
  return api().call(P.readPhotoEditBase, { params: { itemId } }, { signal });
}

export function readPhotoEditPatch(
  itemId: string,
  patchId: string,
  signal: AbortSignal,
): Call<'readPhotoEditPatch'> {
  return api().call(P.readPhotoEditPatch, { params: { itemId, patchId } }, { signal });
}

export function savePhotoEdit(itemId: string, body: PhotoEditSave): Call<'savePhotoEdit'> {
  return api().call(P.savePhotoEdit, { params: { itemId }, body });
}

export function revertPhotoEdit(itemId: string): Call<'revertPhotoEdit'> {
  return api().call(P.revertPhotoEdit, { params: { itemId } });
}

export function erasePhotoArea(itemId: string, body: PhotoErase): Call<'erasePhotoArea'> {
  return api().call(P.erasePhotoArea, { params: { itemId }, body });
}

export function editPhotoVideo(itemId: string, body: VideoEdit): Call<'editPhotoVideo'> {
  return api().call(P.editPhotoVideo, { params: { itemId }, body });
}

export function readPhotoEditJob(jobId: string, signal: AbortSignal): Call<'readPhotoEditJob'> {
  return api().call(P.readPhotoEditJob, { params: { jobId } }, { signal });
}

export function readPhotoAiStatus(signal: AbortSignal): Call<'readPhotoAiStatus'> {
  return api().call(P.readPhotoAiStatus, {}, { signal });
}
