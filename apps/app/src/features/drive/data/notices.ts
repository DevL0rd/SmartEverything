import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { invalidateDriveItemKind, invalidateDriveKinds, receivePhotosProgress } from './live';
import { receiveDriveProgress } from './progress';
import { forwardDriveChanged } from '../phone';
import { invalidateDriveChanged } from './windows';

export const DRIVE_NOTICE_HANDLERS: readonly NoticeHandler[] = [
  noticeHandler(['drive_changed'], (message, { client }) => {
    invalidateDriveChanged(client, message);
    forwardDriveChanged(message);
  }),
  noticeHandler(['drive_comments_changed'], (message, { client }) => {
    invalidateDriveItemKind(client, 'comments', message.itemId);
    invalidateDriveItemKind(client, 'item', message.itemId);
    invalidateDriveKinds(client, ['folder', 'search', 'recent', 'suggested']);
  }),
  noticeHandler(['drive_notification'], (_message, { client }) => {
    invalidateDriveKinds(client, ['notifications']);
  }),
  noticeHandler(['drive_progress'], (message) => {
    receiveDriveProgress(message);
  }),
  noticeHandler(['photos_progress'], (message) => {
    receivePhotosProgress(message);
  }),
];
