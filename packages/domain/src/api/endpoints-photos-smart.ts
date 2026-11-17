import {
  PHOTO_AI_MODEL_CATALOGUE,
  PHOTO_AI_MODELS,
  PHOTO_AI_MODELS_UPDATE,
  PHOTO_AI_REANALYSE,
  PHOTO_AI_REANALYSED,
  PHOTO_AI_SETTINGS,
  PHOTO_AI_STATUS,
  PHOTO_ANALYSIS,
  PHOTO_SUGGESTIONS,
  PHOTO_SUGGEST_QUERY,
} from '../photos/smart';
import { NO_BODY, endpoint } from './endpoint';
import { DRIVE_ITEM_PARAMS } from './endpoints-drive';
import { NOTHING } from './primitives';

export const PHOTOS_SMART_ENDPOINTS = {
  readPhotoAiStatus: endpoint({
    method: 'GET',
    path: '/api/drive/photos/ai/status',
    access: 'member',
    summary:
      'The caller’s Smart features: what is analysed, queued, failed or waiting for a key, the spend and the estimate for the rest',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_AI_STATUS,
  }),
  setPhotoAiSettings: endpoint({
    method: 'PUT',
    path: '/api/drive/photos/ai/settings',
    access: 'member',
    summary:
      'Turn Smart search and tags or Face grouping on or off for the caller; turning one off stops its work and deletes its stored results',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_AI_SETTINGS,
    response: PHOTO_AI_STATUS,
  }),
  listPhotoAiModels: endpoint({
    method: 'GET',
    path: '/api/drive/photos/ai/models',
    access: 'owner',
    summary:
      'The OpenRouter models each Smart feature can use: the ones that take images where a feature needs them and keep no data',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_AI_MODEL_CATALOGUE,
  }),
  setPhotoAiModels: endpoint({
    method: 'PUT',
    path: '/api/drive/photos/ai/models',
    access: 'owner',
    summary:
      'Choose the OpenRouter models for tags, search, pet matching and the eraser for the whole home from the listed models; a changed model applies to new photos',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_AI_MODELS_UPDATE,
    response: PHOTO_AI_MODELS,
  }),
  reanalysePhotos: endpoint({
    method: 'POST',
    path: '/api/drive/photos/ai/reanalyse',
    access: 'owner',
    summary:
      'Analyse the library again with the current models, confirming the estimated cost; everything also redoes photos already analysed by the current vision model',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_AI_REANALYSE,
    response: PHOTO_AI_REANALYSED,
  }),
  retryFailedPhotoAi: endpoint({
    method: 'POST',
    path: '/api/drive/photos/ai/retry',
    access: 'member',
    summary:
      'Run the analysis again for the caller’s photos that failed, and only those; the owner retries every failed photo the status counts',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_AI_STATUS,
  }),
  readPhotoAnalysis: endpoint({
    method: 'GET',
    path: '/api/drive/photos/items/:itemId/analysis',
    access: 'member',
    summary: 'What was found in one photo: caption, scene, labels and the text read from it',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_ANALYSIS,
  }),
  suggestPhotoSearch: endpoint({
    method: 'GET',
    path: '/api/drive/photos/search/suggest',
    access: 'member',
    summary: 'People, pets, things and text in photos that match what is being typed',
    params: NOTHING,
    query: PHOTO_SUGGEST_QUERY,
    body: NO_BODY,
    response: PHOTO_SUGGESTIONS,
  }),
} as const;

export type PhotosSmartEndpoints = typeof PHOTOS_SMART_ENDPOINTS;
