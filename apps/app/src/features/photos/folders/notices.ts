import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { invalidateFolderViews } from './data';

export const PHOTO_FOLDER_NOTICES: NoticeHandler = noticeHandler(
  ['photos_folders_changed'],
  (_message, { client }) => {
    invalidateFolderViews(client);
  },
);
