import { z } from 'zod';
import {
  DRIVE_ACCESS_ANSWER,
  DRIVE_ACCESS_BOXES,
  DRIVE_ACCESS_REQUEST,
  DRIVE_ACCESS_REQUEST_CREATE,
} from '../drive/access-request';
import {
  DRIVE_COMMENT,
  DRIVE_COMMENT_ADD,
  DRIVE_COMMENT_EDIT,
  DRIVE_COMMENT_RESOLVE,
  DRIVE_COMMENT_THREAD,
} from '../drive/comment';
import {
  DRIVE_FILE_REQUEST,
  DRIVE_FILE_REQUEST_CHANGE,
  DRIVE_FILE_REQUEST_CREATE,
  DRIVE_FILE_REQUEST_CREATED,
  DRIVE_FILE_REQUEST_UPLOAD,
} from '../drive/file-request';
import { DRIVE_NOTIFICATION, DRIVE_NOTIFICATIONS_READ } from '../drive/notification';
import { DRIVE_OFFLINE_ITEM, DRIVE_OFFLINE_REPORT, DRIVE_OFFLINE_SET } from '../drive/offline';
import { DRIVE_TRANSFER, DRIVE_TRANSFER_ANSWER, DRIVE_TRANSFER_OFFER } from '../drive/transfer';
import { NO_BODY, endpoint } from './endpoint';
import { CURSOR_QUERY, DRIVE_CURSOR, DRIVE_ITEM_PARAMS, pageOf } from './endpoints-drive';
import { DONE, ID, NOTHING } from './primitives';

export const DRIVE_COMMENTS_CHANGED_NOTICE = z.strictObject({
  type: z.literal('drive_comments_changed'),
  itemId: ID,
});

export type DriveCommentsChangedNotice = z.infer<typeof DRIVE_COMMENTS_CHANGED_NOTICE>;

export const DRIVE_NOTIFICATION_NOTICE = z.strictObject({
  type: z.literal('drive_notification'),
  profileId: ID,
});

export type DriveNotificationNotice = z.infer<typeof DRIVE_NOTIFICATION_NOTICE>;

const COMMENT_PARAMS = z.strictObject({ commentId: ID });
const ACCESS_REQUEST_PARAMS = z.strictObject({ requestId: ID });
const FILE_REQUEST_PARAMS = z.strictObject({ fileRequestId: ID });
const TRANSFER_PARAMS = z.strictObject({ transferId: ID });

export const DRIVE_SOCIAL_ENDPOINTS = {
  listComments: endpoint({
    method: 'GET',
    path: '/api/drive/items/:itemId/comments',
    access: 'member',
    summary: 'The comment threads on a file or folder with their replies, oldest first',
    params: DRIVE_ITEM_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_COMMENT_THREAD),
  }),
  addComment: endpoint({
    method: 'POST',
    path: '/api/drive/items/:itemId/comments',
    access: 'member',
    summary: 'Start a comment thread on a file or folder, or reply to one, mentioning people',
    params: DRIVE_ITEM_PARAMS,
    query: NOTHING,
    body: DRIVE_COMMENT_ADD,
    response: DRIVE_COMMENT,
  }),
  editComment: endpoint({
    method: 'PATCH',
    path: '/api/drive/comments/:commentId',
    access: 'member',
    summary: 'Change the text and mentions of the caller’s own comment',
    params: COMMENT_PARAMS,
    query: NOTHING,
    body: DRIVE_COMMENT_EDIT,
    response: DRIVE_COMMENT,
  }),
  resolveComment: endpoint({
    method: 'POST',
    path: '/api/drive/comments/:commentId/resolve',
    access: 'member',
    summary: 'Resolve a comment thread, or reopen a resolved one',
    params: COMMENT_PARAMS,
    query: NOTHING,
    body: DRIVE_COMMENT_RESOLVE,
    response: DRIVE_COMMENT,
  }),
  removeComment: endpoint({
    method: 'DELETE',
    path: '/api/drive/comments/:commentId',
    access: 'member',
    summary:
      'Delete a comment; a comment with replies stays in its thread as deleted, any other is removed',
    params: COMMENT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  requestDriveAccess: endpoint({
    method: 'POST',
    path: '/api/drive/access-requests',
    access: 'member',
    summary: 'Ask the owner of a file or folder for view or edit access',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_ACCESS_REQUEST_CREATE,
    response: DRIVE_ACCESS_REQUEST,
  }),
  listDriveAccessRequests: endpoint({
    method: 'GET',
    path: '/api/drive/access-requests',
    access: 'member',
    summary: 'The access requests the caller made, or the ones waiting for the caller to answer',
    params: NOTHING,
    query: z.strictObject({ box: z.enum(DRIVE_ACCESS_BOXES), cursor: DRIVE_CURSOR.optional() }),
    body: NO_BODY,
    response: pageOf(DRIVE_ACCESS_REQUEST),
  }),
  answerDriveAccessRequest: endpoint({
    method: 'POST',
    path: '/api/drive/access-requests/:requestId/answer',
    access: 'member',
    summary:
      'Approve an access request with a role and an optional end date, which shares the item, or decline it',
    params: ACCESS_REQUEST_PARAMS,
    query: NOTHING,
    body: DRIVE_ACCESS_ANSWER,
    response: DRIVE_ACCESS_REQUEST,
  }),
  createFileRequest: endpoint({
    method: 'POST',
    path: '/api/drive/file-requests',
    access: 'member',
    summary:
      'Make an upload link that drops the files people send into a folder, without letting them see it',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_FILE_REQUEST_CREATE,
    response: DRIVE_FILE_REQUEST_CREATED,
  }),
  listFileRequests: endpoint({
    method: 'GET',
    path: '/api/drive/file-requests',
    access: 'member',
    summary: 'The file requests the caller made, with how much each received, one page at a time',
    params: NOTHING,
    query: z.strictObject({ folderItemId: ID.optional(), cursor: DRIVE_CURSOR.optional() }),
    body: NO_BODY,
    response: pageOf(DRIVE_FILE_REQUEST),
  }),
  updateFileRequest: endpoint({
    method: 'PATCH',
    path: '/api/drive/file-requests/:fileRequestId',
    access: 'member',
    summary: 'Change a file request’s title, message or end date',
    params: FILE_REQUEST_PARAMS,
    query: NOTHING,
    body: DRIVE_FILE_REQUEST_CHANGE,
    response: DRIVE_FILE_REQUEST,
  }),
  closeFileRequest: endpoint({
    method: 'POST',
    path: '/api/drive/file-requests/:fileRequestId/close',
    access: 'member',
    summary: 'Stop accepting files on a file request; what arrived stays',
    params: FILE_REQUEST_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_FILE_REQUEST,
  }),
  listFileRequestUploads: endpoint({
    method: 'GET',
    path: '/api/drive/file-requests/:fileRequestId/uploads',
    access: 'member',
    summary: 'The files a file request received and who sent each, newest first',
    params: FILE_REQUEST_PARAMS,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_FILE_REQUEST_UPLOAD),
  }),
  listNotifications: endpoint({
    method: 'GET',
    path: '/api/drive/notifications',
    access: 'member',
    summary:
      'The caller’s Drive inbox: shared with you, edits, comments, mentions, requests and transfers, newest first',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_NOTIFICATION),
  }),
  markNotificationsRead: endpoint({
    method: 'POST',
    path: '/api/drive/notifications/read',
    access: 'member',
    summary: 'Mark some Drive notifications, or all of them, as read',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_NOTIFICATIONS_READ,
    response: DONE,
  }),
  offerTransfer: endpoint({
    method: 'POST',
    path: '/api/drive/transfers',
    access: 'member',
    summary: 'Offer a file or folder of the caller’s drive to another person to own',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_TRANSFER_OFFER,
    response: DRIVE_TRANSFER,
  }),
  listTransfers: endpoint({
    method: 'GET',
    path: '/api/drive/transfers',
    access: 'member',
    summary: 'The ownership transfers the caller offered or was offered, newest first',
    params: NOTHING,
    query: CURSOR_QUERY,
    body: NO_BODY,
    response: pageOf(DRIVE_TRANSFER),
  }),
  answerTransfer: endpoint({
    method: 'POST',
    path: '/api/drive/transfers/:transferId/answer',
    access: 'member',
    summary: 'Accept an ownership transfer into the top of the caller’s My Drive, or decline it',
    params: TRANSFER_PARAMS,
    query: NOTHING,
    body: DRIVE_TRANSFER_ANSWER,
    response: DRIVE_TRANSFER,
  }),
  cancelTransfer: endpoint({
    method: 'POST',
    path: '/api/drive/transfers/:transferId/cancel',
    access: 'member',
    summary: 'Take back an ownership transfer that is not answered yet',
    params: TRANSFER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DRIVE_TRANSFER,
  }),
  listOffline: endpoint({
    method: 'GET',
    path: '/api/drive/offline',
    access: 'member',
    summary: 'The files and folders kept offline on the caller’s phones, with their state',
    params: NOTHING,
    query: z.strictObject({ clientId: ID.optional(), cursor: DRIVE_CURSOR.optional() }),
    body: NO_BODY,
    response: pageOf(DRIVE_OFFLINE_ITEM),
  }),
  setOffline: endpoint({
    method: 'PUT',
    path: '/api/drive/offline',
    access: 'member',
    summary: 'Keep a file or folder available offline on a phone, or stop keeping it',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_OFFLINE_SET,
    response: DONE,
  }),
  reportOffline: endpoint({
    method: 'POST',
    path: '/api/drive/offline/report',
    access: 'member',
    summary:
      'A phone reports which offline files it now holds, at which revision, or why one failed',
    params: NOTHING,
    query: NOTHING,
    body: DRIVE_OFFLINE_REPORT,
    response: DONE,
  }),
} as const;
