import type { UseQueryResult } from '@tanstack/react-query';
import type { DriveRoot, MediaInfo, PhotoPlace } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { driveLabelOf, useDriveItem, useDriveRoots, useViewerId } from '../../drive';
import { usePhotoMedia, usePhotoPlace } from '../data/queries';
import { isMediaItem, type MediaItem } from './info-model';
import { wallMonthOf } from './sequence';

export type ViewerItem =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly error: unknown; readonly retry: () => void }
  | { readonly state: 'not-media' }
  | {
      readonly state: 'ready';
      readonly item: MediaItem;
      readonly media: MediaInfo | null;
      readonly place: PhotoPlace | null;
      readonly library: string | null;
      readonly month: string | null;
    };

function retryOf(query: UseQueryResult): () => void {
  return (): void => {
    background(query.refetch(), 'photos.viewer.retry_failed');
  };
}

function monthOf(item: MediaItem, media: MediaInfo | null): string | null {
  if (item.takenAt === null || media === null) return null;
  return wallMonthOf(item.takenAt, media.tzOffsetMin);
}

function libraryOf(root: DriveRoot | null, viewerId: string | null): string | null {
  return root === null ? null : driveLabelOf(root, viewerId);
}

export function useViewerItem(itemId: string): ViewerItem {
  const item = useDriveItem(itemId, null);
  const media = usePhotoMedia(itemId);
  const place = usePhotoPlace(media.data?.placeId ?? null);
  const roots = useDriveRoots();
  const viewerId = useViewerId();
  if (item.data === undefined) {
    return item.isError
      ? { state: 'error', error: item.error, retry: retryOf(item) }
      : { state: 'loading' };
  }
  if (!isMediaItem(item.data)) return { state: 'not-media' };
  const mediaInfo = media.data ?? null;
  const rootId = item.data.rootId;
  return {
    state: 'ready',
    item: item.data,
    media: mediaInfo,
    place: place.data ?? null,
    library: libraryOf(roots.find((root) => root.id === rootId) ?? null, viewerId),
    month: monthOf(item.data, mediaInfo),
  };
}
