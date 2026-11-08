import type { ChangeFeed } from '../store/feed';
import type { PhotosProgressNotice } from '@smarteverything/domain';

export type PhotosProgressFeed = Pick<ChangeFeed, 'notice'>;

export type PhotosProgress = Omit<PhotosProgressNotice, 'type'>;

export function announcePhotosProgress(feed: PhotosProgressFeed, progress: PhotosProgress): void {
  feed.notice({ type: 'photos_progress', ...progress });
}
