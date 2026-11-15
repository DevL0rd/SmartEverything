import {
  PHOTO_GROUP,
  PHOTO_GROUP_MERGE,
  PHOTO_GROUP_PARAMS,
  PHOTO_GROUP_UPDATE,
  PHOTO_ITEM_FACES,
  PHOTO_MERGE_DISMISS,
  PHOTO_PEOPLE,
  PHOTO_PEOPLE_QUERY,
  PHOTO_REMOVE_FACES,
} from '../photos/people';
import { NO_BODY, endpoint } from './endpoint';
import { DRIVE_ITEM_PARAMS } from './endpoints-drive';
import { DONE, NOTHING } from './primitives';

export const PHOTOS_PEOPLE_ENDPOINTS = {
  listPhotoGroups: endpoint({
    method: 'GET',
    path: '/api/drive/photos/people',
    access: 'member',
    summary:
      'The caller’s people and pets with names, covers and counts, and suggested merges of groups that look like one',
    params: NOTHING,
    query: PHOTO_PEOPLE_QUERY,
    body: NO_BODY,
    response: PHOTO_PEOPLE,
  }),
  readPhotoGroup: endpoint({
    method: 'GET',
    path: '/api/drive/photos/people/:groupId',
    access: 'member',
    summary: 'One person or pet; their photos come from the library with the group as scope',
    params: PHOTO_GROUP_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_GROUP,
  }),
  updatePhotoGroup: endpoint({
    method: 'PATCH',
    path: '/api/drive/photos/people/:groupId',
    access: 'member',
    summary: 'Name a person or pet, link a person to a household member, or hide the group',
    params: PHOTO_GROUP_PARAMS,
    query: NOTHING,
    body: PHOTO_GROUP_UPDATE,
    response: PHOTO_GROUP,
  }),
  mergePhotoGroups: endpoint({
    method: 'POST',
    path: '/api/drive/photos/people/merge',
    access: 'member',
    summary: 'Merge groups that are the same person or pet into one',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_GROUP_MERGE,
    response: PHOTO_GROUP,
  }),
  dismissPhotoMergeSuggestion: endpoint({
    method: 'POST',
    path: '/api/drive/photos/people/dismiss-merge',
    access: 'member',
    summary:
      'Say two groups are not the same person or pet so the suggestion to merge them never returns',
    params: NOTHING,
    query: NOTHING,
    body: PHOTO_MERGE_DISMISS,
    response: DONE,
  }),
  removePhotoGroupFaces: endpoint({
    method: 'POST',
    path: '/api/drive/photos/people/:groupId/remove-faces',
    access: 'member',
    summary:
      'Tell the hub these faces are not this person or pet so they never return to the group',
    params: PHOTO_GROUP_PARAMS,
    query: NOTHING,
    body: PHOTO_REMOVE_FACES,
    response: PHOTO_GROUP.nullable(),
  }),
  readPhotoFaces: endpoint({
    method: 'GET',
    path: '/api/drive/photos/items/:itemId/faces',
    access: 'member',
    summary: 'The faces and pets found in one photo, with the group each belongs to for the caller',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PHOTO_ITEM_FACES,
  }),
} as const;
