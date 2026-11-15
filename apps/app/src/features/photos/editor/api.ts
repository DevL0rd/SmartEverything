import {
  PHOTOS_ENDPOINTS as P,
  type PhotoEditSave,
  type PhotoErase,
  type VideoEdit,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import type { PhotosResult } from '../../../api/photos';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export function readPhotoEdit(itemId: string): Call<'readPhotoEdit'> {
  return api().call(P.readPhotoEdit, { params: { itemId } });
}

export function readPhotoEditBase(itemId: string): Call<'readPhotoEditBase'> {
  return api().call(P.readPhotoEditBase, { params: { itemId } });
}

export function readPhotoEditPatch(itemId: string, patchId: string): Call<'readPhotoEditPatch'> {
  return api().call(P.readPhotoEditPatch, { params: { itemId, patchId } });
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

export function readPhotoEditJob(jobId: string): Call<'readPhotoEditJob'> {
  return api().call(P.readPhotoEditJob, { params: { jobId } });
}

export function readPhotoAiStatus(): Call<'readPhotoAiStatus'> {
  return api().call(P.readPhotoAiStatus, {});
}
