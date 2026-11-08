import type { DriveDayRange, DriveDurationBucket, DriveQueryPage } from '@smarteverything/domain';
import { searchDrive } from '../../../api/drive';
import type { DriveResult } from '../../../api/drive';
import { useDriveTrash } from '../../nas/data/queries';
import { useDrivePages, type DrivePages } from '../../nas/data/pages';
import { photoKeys } from './keys';

export interface PhotoSearch {
  readonly text: string | null;
  readonly starred: boolean | null;
  readonly duration: DriveDurationBucket | null;
  readonly taken: DriveDayRange | null;
  readonly kinds: readonly ('image' | 'video')[];
}

export function usePhotoSearch(search: PhotoSearch, enabled: boolean): DrivePages<DriveQueryPage> {
  return useDrivePages<DriveQueryPage>({
    queryKey: photoKeys.search(search),
    read: (cursor) =>
      searchDrive({
        ...search,
        rootId: null,
        folderId: null,
        sort: { field: 'takenAt', direction: 'desc' },
        cursor,
      }),
    enabled,
  });
}

export function usePhotoDeleted(): DrivePages<DriveResult<'listTrash'>> {
  return useDriveTrash(null);
}
