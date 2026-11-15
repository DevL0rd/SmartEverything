import {
  keepPreviousData,
  skipToken,
  useQueries,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  DriveAccessBox,
  DriveItem,
  DriveItemText,
  DriveOpenItem,
  DriveZipEntryLink,
  DriveQuery,
  DriveSearchPage,
  DriveRecentFilter,
  DriveSort,
} from '@smarteverything/domain';
import {
  type DriveResult,
  browseDrive,
  listDriveAccessRequests,
  listDriveComments,
  listDriveFileRequestUploads,
  listDriveFileRequests,
  listDriveNotifications,
  listDriveOffline,
  listDriveSuggested,
  listDriveTransfers,
  listDriveZipEntries,
  openDriveItem,
  readDriveItemText,
  readDriveZipEntryLink,
  listDriveAlbumItems,
  listDriveConflicts,
  listDriveDuplicates,
  listDriveQuotas,
  listDriveShares,
  listDriveTrash,
  listDriveItemActivity,
  listDriveActivity,
  listDriveVersions,
  listDriveGrants,
  listDriveSharedByMe,
  listDriveSharedWithMe,
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
import { useScreenPaused } from '../../../design/screen-pause';
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

export function useDriveItems(
  itemIds: readonly string[],
  rootId: string | null,
): readonly (DriveItem | undefined)[] {
  const paused = useScreenPaused();
  return useQueries({
    queries: itemIds.map((itemId) => ({
      queryKey: driveKey('item', inRoot(rootId), itemId),
      queryFn: (): Promise<DriveItem> => readDriveItem(itemId),
      retry: false,
    })),
    subscribed: !paused,
    combine: (results) => results.map((result) => result.data),
  });
}

export function useDriveSearch(
  query: Omit<DriveQuery, 'cursor'>,
  enabled: boolean,
): DrivePages<DriveSearchPage> {
  return useDrivePages<DriveSearchPage>({
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

export function useDriveGrants(itemId: string | null): UseQueryResult<DriveResult<'listGrants'>> {
  return useScreenQuery({
    queryKey: driveKey('grants', DRIVE_EVERYWHERE, itemId),
    queryFn:
      itemId === null
        ? skipToken
        : (): Promise<DriveResult<'listGrants'>> => listDriveGrants(itemId),
    retry: false,
  });
}

export function useSharedWithMe(enabled = true): DrivePages<DriveResult<'listSharedWithMe'>> {
  return useDrivePages({
    queryKey: driveKey('shared-with-me', DRIVE_EVERYWHERE),
    read: listDriveSharedWithMe,
    enabled,
  });
}

export function useSharedByMe(): DrivePages<DriveResult<'listSharedByMe'>> {
  return useDrivePages({
    queryKey: driveKey('shared-by-me', DRIVE_EVERYWHERE),
    read: listDriveSharedByMe,
  });
}

export function useDriveZipEntries(
  itemId: string,
  rev: number,
): DrivePages<DriveResult<'listZipEntries'>> {
  return useDrivePages({
    queryKey: driveKey('zip-entries', DRIVE_EVERYWHERE, itemId, rev),
    read: (cursor) => listDriveZipEntries(itemId, cursor),
  });
}

export function useDriveZipEntryLink(
  itemId: string | null,
  rev: number,
  index: number | null,
): UseQueryResult<DriveZipEntryLink> {
  return useScreenQuery<DriveZipEntryLink>({
    queryKey: driveKey('zip-link', DRIVE_EVERYWHERE, itemId, rev, index),
    queryFn:
      itemId === null || index === null
        ? skipToken
        : (): Promise<DriveZipEntryLink> => readDriveZipEntryLink(itemId, index),
    retry: false,
  });
}

export function useDriveItemText(
  itemId: string | null,
  rev: number,
): UseQueryResult<DriveItemText> {
  return useScreenQuery<DriveItemText>({
    queryKey: driveKey('item-text', DRIVE_EVERYWHERE, itemId, rev),
    queryFn: itemId === null ? skipToken : (): Promise<DriveItemText> => readDriveItemText(itemId),
    retry: false,
  });
}

export function useDriveOpenItem(itemId: string | null): UseQueryResult<DriveOpenItem> {
  return useScreenQuery<DriveOpenItem>({
    queryKey: driveKey('open-item', DRIVE_EVERYWHERE, itemId),
    queryFn: itemId === null ? skipToken : (): Promise<DriveOpenItem> => openDriveItem(itemId),
    retry: false,
  });
}

export function useDriveSuggested(): DrivePages<DriveResult<'listSuggested'>> {
  return useDrivePages({
    queryKey: driveKey('suggested', DRIVE_EVERYWHERE),
    read: listDriveSuggested,
  });
}

export function useDriveComments(itemId: string): DrivePages<DriveResult<'listComments'>> {
  return useDrivePages({
    queryKey: driveKey('comments', DRIVE_EVERYWHERE, itemId),
    read: (cursor) => listDriveComments(itemId, cursor),
  });
}

export function useDriveAccessRequests(
  box: DriveAccessBox,
): DrivePages<DriveResult<'listDriveAccessRequests'>> {
  return useDrivePages({
    queryKey: driveKey('access-requests', DRIVE_EVERYWHERE, box),
    read: (cursor) => listDriveAccessRequests(box, cursor),
  });
}

export function useDriveFileRequests(
  folderItemId: string | null,
): DrivePages<DriveResult<'listFileRequests'>> {
  return useDrivePages({
    queryKey: driveKey('file-requests', DRIVE_EVERYWHERE, folderItemId),
    read: (cursor) => listDriveFileRequests(folderItemId, cursor),
  });
}

export function useDriveFileRequestUploads(
  fileRequestId: string,
): DrivePages<DriveResult<'listFileRequestUploads'>> {
  return useDrivePages({
    queryKey: driveKey('file-request-uploads', DRIVE_EVERYWHERE, fileRequestId),
    read: (cursor) => listDriveFileRequestUploads(fileRequestId, cursor),
  });
}

export function useDriveNotifications(): DrivePages<DriveResult<'listNotifications'>> {
  return useDrivePages({
    queryKey: driveKey('notifications', DRIVE_EVERYWHERE),
    read: listDriveNotifications,
  });
}

export function useDriveTransfers(): DrivePages<DriveResult<'listTransfers'>> {
  return useDrivePages({
    queryKey: driveKey('transfers', DRIVE_EVERYWHERE),
    read: listDriveTransfers,
  });
}

export function useDriveOffline(clientId: string | null): DrivePages<DriveResult<'listOffline'>> {
  return useDrivePages({
    queryKey: driveKey('offline', DRIVE_EVERYWHERE, clientId),
    read: (cursor) => listDriveOffline(clientId, cursor),
  });
}
