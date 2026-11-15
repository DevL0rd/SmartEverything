import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { invalidateAlbumActivity, invalidateSharing } from './queries';

export const PHOTO_SHARING_NOTICES: NoticeHandler = noticeHandler(
  ['photos_activity', 'photos_partner'],
  (message, { client }) => {
    if (message.type === 'photos_partner') {
      invalidateSharing(client);
      return;
    }
    invalidateAlbumActivity(client, message.albumId);
    if (
      message.kind === 'added' ||
      message.kind === 'left' ||
      message.kind === 'joined' ||
      message.kind === 'invited'
    ) {
      invalidateSharing(client);
    }
  },
);
