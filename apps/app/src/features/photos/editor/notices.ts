import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { receiveEditJob } from './queries';

export const PHOTO_EDIT_NOTICES: NoticeHandler = noticeHandler(
  ['photos_edit_job'],
  (message, { client }) => {
    receiveEditJob(client, message.job);
  },
);
