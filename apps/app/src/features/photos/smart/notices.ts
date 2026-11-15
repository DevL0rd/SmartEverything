import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { invalidatePeople } from '../people/queries';
import { invalidateAiStatus } from './queries';

export const PHOTO_AI_NOTICES: NoticeHandler = noticeHandler(
  ['photos_ai'],
  (message, { client }) => {
    invalidateAiStatus(client);
    if (message.stage === 'faces' && message.done === message.total) invalidatePeople(client);
  },
);
