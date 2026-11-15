import { PHOTO_FOLDERS, PHOTO_FOLDER_HIDE, PHOTO_HIDDEN_FOLDERS } from '../photos/folders';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const PHOTOS_FOLDER_ENDPOINTS = {
  listPhotoFolders: endpoint({
    method: 'GET',
    path: '/api/drive/photos/folders',
    access: 'member',
    summary:
      'The Drive folders that hold the caller’s photos and the phone albums and computer folders they were backed up from',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_FOLDERS,
  }),
  listHiddenPhotoFolders: endpoint({
    method: 'GET',
    path: '/api/drive/photos/folders/hidden',
    access: 'member',
    summary: 'The folders the caller hides from the Photos library and the other photo views',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_HIDDEN_FOLDERS,
  }),
  setPhotoFolderHidden: endpoint({
    method: 'PUT',
    path: '/api/drive/photos/folders/hidden',
    access: 'member',
    summary:
      'Hide a folder from the Photos library and the other photo views, or show it again; backup is not affected',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_FOLDER_HIDE,
    response: PHOTO_HIDDEN_FOLDERS,
  }),
};
