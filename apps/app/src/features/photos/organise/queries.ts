import { keepPreviousData, skipToken, type UseQueryResult } from '@tanstack/react-query';
import type { LibraryBucket, LibraryPage } from '@smarteverything/domain';
import type { PhotosResult } from '../../../api/photos';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDrivePages, type DrivePages } from '../../drive';
import { photoKeys, PHOTO_ALL } from '../data/keys';
import {
  readArchiveBuckets,
  readArchivePage,
  readLockedBuckets,
  readLockedPage,
  readLockedState,
  readPhotoArchived,
} from './api';

export type MonthSource =
  { readonly kind: 'archive' } | { readonly kind: 'locked'; readonly token: string };

export const ARCHIVE_SOURCE: MonthSource = { kind: 'archive' };

export function sourceKeyOf(source: MonthSource): string {
  return source.kind === 'archive' ? 'archive' : `locked:${source.token}`;
}

export function useSourceBuckets(source: MonthSource): UseQueryResult<readonly LibraryBucket[]> {
  return useScreenQuery({
    queryKey:
      source.kind === 'archive'
        ? photoKeys.archiveBuckets(PHOTO_ALL)
        : photoKeys.lockedBuckets(source.token),
    queryFn: () =>
      source.kind === 'archive'
        ? readArchiveBuckets(PHOTO_ALL)
        : readLockedBuckets(source.token, PHOTO_ALL),
    ...(source.kind === 'archive' ? { placeholderData: keepPreviousData } : { gcTime: 0 }),
    retry: false,
  });
}

export function useSourceMonth(source: MonthSource, month: string): DrivePages<LibraryPage> {
  return useDrivePages({
    queryKey:
      source.kind === 'archive'
        ? photoKeys.archiveMonth(month, PHOTO_ALL)
        : photoKeys.lockedMonth(source.token, month),
    read: (cursor) =>
      source.kind === 'archive'
        ? readArchivePage(month, PHOTO_ALL, cursor)
        : readLockedPage(source.token, month, PHOTO_ALL, cursor),
  });
}

export function useLockedState(enabled: boolean): UseQueryResult<PhotosResult<'readLockedState'>> {
  return useScreenQuery({
    queryKey: photoKeys.lockedState(),
    queryFn: enabled ? readLockedState : skipToken,
    retry: false,
  });
}

export function usePhotoArchived(
  itemId: string,
): UseQueryResult<PhotosResult<'readPhotoArchived'>> {
  return useScreenQuery({
    queryKey: photoKeys.archived(itemId),
    queryFn: () => readPhotoArchived(itemId),
    retry: false,
  });
}
