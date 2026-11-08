import { keepPreviousData, skipToken, type UseQueryResult } from '@tanstack/react-query';
import type {
  DriveItem,
  DriveQuery,
  DriveQueryPage,
  DriveRecentFilter,
  DriveSort,
} from '@smarteverything/domain';
import {
  type DriveResult,
  browseDrive,
  listDriveAlbumItems,
  listDriveConflicts,
  listDriveDuplicates,
  listDriveQuotas,
  listDriveShares,
  listDriveTrash,
  listDriveItemActivity,
  listDriveActivity,
  listDriveVersions,
  listDriveVolumes,
  readDriveBackupStatus,
  readDriveHealth,
  readDriveItem,
  readDriveRecent,
  readDriveSettings,
  readDriveStats,
  readDriveUsage,
  searchDrive,
} from '../../../api/drive';
import { DRIVE_EVERYWHERE, driveKey, type DriveWindowScope } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDrivePages, type DrivePages } from './pages';

const inRoot = (rootId: string | null): DriveWindowScope => ({ ...DRIVE_EVERYWHERE, rootId });

export function useDriveFolderPages(
  rootId: string,
  folderId: string | null,
  sort: DriveSort | null,
): DrivePages<DriveResult<'browseFolder'>> {
  return useDrivePages({
    queryKey: driveKey('folder', { rootId, folderId, albumId: null }, sort),
    read: (cursor) =>
      browseDrive({
        rootId,
        ...(folderId === null ? {} : { folderId }),
        ...(sort === null ? {} : { sortField: sort.field, sortDirection: sort.direction }),
        ...(cursor === null ? {} : { cursor }),
      }),
  });
}

export function useDriveItem(
  itemId: string | null,
  rootId: string | null,
): UseQueryResult<DriveItem> {
  return useScreenQuery<DriveItem>({
    queryKey: driveKey('item', inRoot(rootId), itemId),
    queryFn: itemId === null ? skipToken : (): Promise<DriveItem> => readDriveItem(itemId),
    retry: false,
  });
}

export function useDriveSearch(
  query: Omit<DriveQuery, 'cursor'>,
  enabled: boolean,
): DrivePages<DriveQueryPage> {
  return useDrivePages<DriveQueryPage>({
    queryKey: driveKey('search', inRoot(query.rootId), query),
    read: (cursor) => searchDrive({ ...query, cursor }),
    enabled,
  });
}

export function useDriveRecent(filter: DriveRecentFilter): DrivePages<DriveResult<'readRecent'>> {
  return useDrivePages({
    queryKey: driveKey('recent', DRIVE_EVERYWHERE, filter),
    read: (cursor) => readDriveRecent(filter, cursor),
  });
}

export function useDriveStats(): UseQueryResult<DriveResult<'readDriveStats'>> {
  return useScreenQuery({
    queryKey: driveKey('stats', DRIVE_EVERYWHERE),
    queryFn: readDriveStats,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useDriveDuplicates(
  rootId: string | null,
): DrivePages<DriveResult<'listDuplicates'>> {
  return useDrivePages({
    queryKey: driveKey('duplicates', inRoot(rootId)),
    read: (cursor) => listDriveDuplicates(rootId, cursor),
  });
}

export function useDriveAlbumItems(albumId: string): DrivePages<DriveResult<'listAlbumItems'>> {
  return useDrivePages({
    queryKey: driveKey('album-items', { rootId: null, folderId: null, albumId }),
    read: (cursor) => listDriveAlbumItems(albumId, cursor),
  });
}

export function useDriveTrash(rootId: string | null): DrivePages<DriveResult<'listTrash'>> {
  return useDrivePages({
    queryKey: driveKey('trash', inRoot(rootId)),
    read: (cursor) => listDriveTrash(rootId, cursor),
  });
}

export function useDriveVersions(
  itemId: string,
  rootId: string | null,
): DrivePages<DriveResult<'listVersions'>> {
  return useDrivePages({
    queryKey: driveKey('versions', inRoot(rootId), itemId),
    read: (cursor) => listDriveVersions(itemId, cursor),
  });
}

export function useDriveActivity(from: string): DrivePages<DriveResult<'listDriveActivity'>> {
  return useDrivePages({
    queryKey: driveKey('activity', DRIVE_EVERYWHERE, from),
    read: (cursor) => listDriveActivity(from, cursor),
  });
}

export function useDriveItemActivity(
  itemId: string,
  rootId: string | null,
): DrivePages<DriveResult<'listItemActivity'>> {
  return useDrivePages({
    queryKey: driveKey('item-activity', inRoot(rootId), itemId),
    read: (cursor) => listDriveItemActivity(itemId, cursor),
  });
}

export function useDriveShares(itemId: string | null): DrivePages<DriveResult<'listShares'>> {
  return useDrivePages({
    queryKey: driveKey('shares', null, itemId),
    read: (cursor) => listDriveShares(itemId, cursor),
  });
}

export function useDriveUsage(): UseQueryResult<DriveResult<'readUsage'>> {
  return useScreenQuery({
    queryKey: driveKey('usage', DRIVE_EVERYWHERE),
    queryFn: readDriveUsage,
    retry: false,
  });
}

export function useDriveHealth(): UseQueryResult<DriveResult<'readHealth'>> {
  return useScreenQuery({
    queryKey: driveKey('health', DRIVE_EVERYWHERE),
    queryFn: readDriveHealth,
    retry: false,
  });
}

export function useDriveConflicts(rootId: string | null): DrivePages<DriveResult<'listConflicts'>> {
  return useDrivePages({
    queryKey: driveKey('conflicts', inRoot(rootId)),
    read: (cursor) => listDriveConflicts(rootId, cursor),
  });
}

export function useDriveSettings(): UseQueryResult<DriveResult<'readDriveSettings'>> {
  return useScreenQuery({
    queryKey: driveKey('settings', null),
    queryFn: readDriveSettings,
    retry: false,
  });
}

export function useDriveQuotas(enabled: boolean): UseQueryResult<DriveResult<'listQuotas'>> {
  return useScreenQuery({
    queryKey: driveKey('quotas', null),
    queryFn: listDriveQuotas,
    enabled,
    retry: false,
  });
}

export function useDriveBackupStatus(
  enabled: boolean,
): UseQueryResult<DriveResult<'readBackupStatus'>> {
  return useScreenQuery({
    queryKey: driveKey('backup', null),
    queryFn: readDriveBackupStatus,
    enabled,
    retry: false,
  });
}

export function useDriveVolumes(enabled: boolean): UseQueryResult<DriveResult<'listVolumes'>> {
  return useScreenQuery({
    queryKey: driveKey('volumes', null),
    queryFn: listDriveVolumes,
    enabled,
    retry: false,
  });
}
