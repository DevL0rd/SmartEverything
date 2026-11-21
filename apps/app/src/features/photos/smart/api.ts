import {
  PHOTOS_ENDPOINTS as P,
  type PhotoAiModelsUpdate,
  type PhotoAiReanalyse,
  type PhotoAiSettings,
} from '@smarteverything/domain';
import type { PhotosResult } from '../../../api/photos';
import { api } from '../../../api/transport';

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export function readPhotoAiStatus(signal: AbortSignal): Call<'readPhotoAiStatus'> {
  return api().call(P.readPhotoAiStatus, {}, { signal });
}

export function setPhotoAiSettings(body: PhotoAiSettings): Call<'setPhotoAiSettings'> {
  return api().call(P.setPhotoAiSettings, { body });
}

export function listPhotoAiModels(signal: AbortSignal): Call<'listPhotoAiModels'> {
  return api().call(P.listPhotoAiModels, {}, { signal });
}

export function setPhotoAiModels(body: PhotoAiModelsUpdate): Call<'setPhotoAiModels'> {
  return api().call(P.setPhotoAiModels, { body });
}

export function reanalysePhotos(body: PhotoAiReanalyse): Call<'reanalysePhotos'> {
  return api().call(P.reanalysePhotos, { body });
}

export function retryFailedPhotoAi(): Call<'retryFailedPhotoAi'> {
  return api().call(P.retryFailedPhotoAi, {});
}

export function readPhotoAnalysis(itemId: string, signal: AbortSignal): Call<'readPhotoAnalysis'> {
  return api().call(P.readPhotoAnalysis, { params: { itemId } }, { signal });
}

export function suggestPhotoSearch(q: string, signal: AbortSignal): Call<'suggestPhotoSearch'> {
  return api().call(P.suggestPhotoSearch, { query: { q } }, { signal });
}
