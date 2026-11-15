import {
  skipToken,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import type { PhotosResult } from '../../../api/photos';
import { DRIVE_PREFIX } from '../../../queries/keys';
import { useScreenInfiniteQuery, useScreenQuery } from '../../../queries/use-screen-query';
import { photoKeys } from '../data/keys';
import { listAlbumActivity, readPhotoSharing } from './api';

export type ActivityPage = PhotosResult<'listPhotoAlbumActivity'>;

export function usePhotoSharing(): UseQueryResult<PhotosResult<'readPhotoSharing'>> {
  return useScreenQuery({
    queryKey: photoKeys.sharing(),
    queryFn: readPhotoSharing,
    retry: false,
  });
}

export function useAlbumActivity(
  albumId: string | null,
): UseInfiniteQueryResult<InfiniteData<ActivityPage>> {
  return useScreenInfiniteQuery({
    queryKey: photoKeys.albumActivity(albumId),
    queryFn:
      albumId === null
        ? skipToken
        : ({ pageParam }: { readonly pageParam: string | null }): Promise<ActivityPage> =>
            listAlbumActivity(albumId, pageParam),
    initialPageParam: null,
    getNextPageParam: (page: ActivityPage) => page.next,
    retry: false,
  });
}

const SHARED_KINDS = [
  'photo-sharing',
  'photo-rail-counts',
  'photo-buckets',
  'photo-month',
  'album-items',
] as const;

export function invalidateSharing(client: QueryClient): void {
  for (const kind of SHARED_KINDS) {
    background(
      client.invalidateQueries({ queryKey: [...DRIVE_PREFIX, kind] }),
      'photos.sharing.invalidate_failed',
      { kind },
    );
  }
}

export function invalidateAlbumActivity(client: QueryClient, albumId: string): void {
  background(
    client.invalidateQueries({ queryKey: photoKeys.albumActivity(albumId) }),
    'photos.sharing.invalidate_failed',
    { kind: 'album-activity' },
  );
  for (const key of [photoKeys.sharing(), photoKeys.railCounts()]) {
    background(client.invalidateQueries({ queryKey: key }), 'photos.sharing.invalidate_failed', {
      kind: 'overview',
    });
  }
}

export function useSharingRefresh(): () => void {
  const client = useQueryClient();
  return (): void => {
    invalidateSharing(client);
  };
}
