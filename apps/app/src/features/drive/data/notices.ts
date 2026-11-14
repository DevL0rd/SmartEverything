import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { receivePhotosProgress } from './live';
import { receiveDriveProgress } from './progress';
import { invalidateDriveChanged } from './windows';

export const DRIVE_NOTICE_HANDLERS: readonly NoticeHandler[] = [
  noticeHandler(['drive_changed'], (message, { client }) => {
    invalidateDriveChanged(client, message);
  }),
  noticeHandler(['drive_progress'], (message) => {
    receiveDriveProgress(message);
  }),
  noticeHandler(['photos_progress'], (message) => {
    receivePhotosProgress(message);
  }),
];
