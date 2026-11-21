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
  openDriveItem,
  readDriveItemText,
  readDriveZipEntryLink,
  listDriveQuotas,
  listDriveGrants,
  readDriveBackupStatus,
  readDriveHealth,
  readDriveItem,
  readDriveSettings,
  readDriveStats,
  readDriveUsage,
} from '../../../api/drive';
import {
  browseDrive,
  listDriveAccessRequests,
  listDriveActivity,
  listDriveAlbumItems,
  listDriveComments,
  listDriveConflicts,
  listDriveDuplicates,
  listDriveFileRequestUploads,
  listDriveFileRequests,
  listDriveItemActivity,
  listDriveNotifications,
  listDriveOffline,
  listDriveSharedByMe,
  listDriveSharedWithMe,
  listDriveShares,
  listDriveSuggested,
  listDriveTransfers,
  listDriveTrash,
  listDriveVersions,
  listDriveZipEntries,
  readDriveRecent,
  searchDrive,
} from '../../../api/drive-pages';
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
    read: (cursor, signal) =>
      browseDrive(
        {
          rootId,
          ...(folderId === null ? {} : { folderId }),
          ...(sort === null ? {} : { sortField: sort.field, sortDirection: sort.direction }),
          ...(cursor === null ? {} : { cursor }),
        },
        signal,
      ),
  });
}

export function useDriveItem(
  itemId: string | null,
  rootId: string | null,
): UseQueryResult<DriveItem> {
  return useScreenQuery<DriveItem>({
    queryKey: driveKey('item', inRoot(rootId), itemId),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): Promise<DriveItem> => readDriveItem(itemId, { signal }),
    retry: false,
  });
}

interface ItemQuery {
  readonly queryKey: ReturnType<typeof driveKey>;
  readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<DriveItem>;
  readonly retry: false;
}

function itemQueries(itemIds: readonly string[], rootId: string | null): ItemQuery[] {
  return itemIds.map((itemId) => ({
    queryKey: driveKey('item', inRoot(rootId), itemId),
    queryFn: ({ signal }): Promise<DriveItem> => readDriveItem(itemId, { signal }),
    retry: false,
  }));
}

export function useDriveItems(
  itemIds: readonly string[],
  rootId: string | null,
): readonly (DriveItem | undefined)[] {
  const paused = useScreenPaused();
  return useQueries({
    queries: itemQueries(itemIds, rootId),
    subscribed: !paused,
    combine: (results) => results.map((result) => result.data),
  });
}

export interface DriveItemRead {
  readonly item: DriveItem | undefined;
  readonly pending: boolean;
}

export function useDriveItemReads(
  itemIds: readonly string[],
  rootId: string | null,
): readonly DriveItemRead[] {
  const paused = useScreenPaused();
  return useQueries({
    queries: itemQueries(itemIds, rootId),
    subscribed: !paused,
    combine: (results) =>
      results.map((result) => ({ item: result.data, pending: result.isPending })),
  });
}

export function useDriveSearch(
  query: Omit<DriveQuery, 'cursor'>,
  enabled: boolean,
): DrivePages<DriveSearchPage> {
  return useDrivePages<DriveSearchPage>({
    queryKey: driveKey('search', inRoot(query.rootId), query),
    read: (cursor, signal) => searchDrive({ ...query, cursor }, signal),
    enabled,
  });
}

export function useDriveRecent(filter: DriveRecentFilter): DrivePages<DriveResult<'readRecent'>> {
  return useDrivePages({
    queryKey: driveKey('recent', DRIVE_EVERYWHERE, filter),
    read: (cursor, signal) => readDriveRecent(filter, cursor, signal),
  });
}

export function useDriveStats(): UseQueryResult<DriveResult<'readDriveStats'>> {
  return useScreenQuery({
    queryKey: driveKey('stats', DRIVE_EVERYWHERE),
    queryFn: ({ signal }) => readDriveStats(signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useDriveDuplicates(
  rootId: string | null,
): DrivePages<DriveResult<'listDuplicates'>> {
  return useDrivePages({
    queryKey: driveKey('duplicates', inRoot(rootId)),
    read: (cursor, signal) => listDriveDuplicates(rootId, cursor, signal),
  });
}

export function useDriveAlbumItems(albumId: string): DrivePages<DriveResult<'listAlbumItems'>> {
  return useDrivePages({
    queryKey: driveKey('album-items', { rootId: null, folderId: null, albumId }),
    read: (cursor, signal) => listDriveAlbumItems(albumId, cursor, signal),
  });
}

export function useDriveTrash(rootId: string | null): DrivePages<DriveResult<'listTrash'>> {
  return useDrivePages({
    queryKey: driveKey('trash', inRoot(rootId)),
    read: (cursor, signal) => listDriveTrash(rootId, cursor, signal),
  });
}

export function useDriveVersions(
  itemId: string,
  rootId: string | null,
): DrivePages<DriveResult<'listVersions'>> {
  return useDrivePages({
    queryKey: driveKey('versions', inRoot(rootId), itemId),
    read: (cursor, signal) => listDriveVersions(itemId, cursor, signal),
  });
}

export function useDriveActivity(from: string): DrivePages<DriveResult<'listDriveActivity'>> {
  return useDrivePages({
    queryKey: driveKey('activity', DRIVE_EVERYWHERE, from),
    read: (cursor, signal) => listDriveActivity(from, cursor, signal),
  });
}

export function useDriveItemActivity(
  itemId: string,
  rootId: string | null,
): DrivePages<DriveResult<'listItemActivity'>> {
  return useDrivePages({
    queryKey: driveKey('item-activity', inRoot(rootId), itemId),
    read: (cursor, signal) => listDriveItemActivity(itemId, cursor, signal),
  });
}

export function useDriveShares(itemId: string | null): DrivePages<DriveResult<'listShares'>> {
  return useDrivePages({
    queryKey: driveKey('shares', null, itemId),
    read: (cursor, signal) => listDriveShares(itemId, cursor, signal),
  });
}

export function useDriveUsage(): UseQueryResult<DriveResult<'readUsage'>> {
  return useScreenQuery({
    queryKey: driveKey('usage', DRIVE_EVERYWHERE),
    queryFn: ({ signal }) => readDriveUsage(signal),
    retry: false,
  });
}

export function useDriveHealth(): UseQueryResult<DriveResult<'readHealth'>> {
  return useScreenQuery({
    queryKey: driveKey('health', DRIVE_EVERYWHERE),
    queryFn: ({ signal }) => readDriveHealth(signal),
    retry: false,
  });
}

export function useDriveConflicts(rootId: string | null): DrivePages<DriveResult<'listConflicts'>> {
  return useDrivePages({
    queryKey: driveKey('conflicts', inRoot(rootId)),
    read: (cursor, signal) => listDriveConflicts(rootId, cursor, signal),
  });
}

export function useDriveSettings(): UseQueryResult<DriveResult<'readDriveSettings'>> {
  return useScreenQuery({
    queryKey: driveKey('settings', null),
    queryFn: ({ signal }) => readDriveSettings(signal),
    retry: false,
  });
}

export function useDriveQuotas(enabled: boolean): UseQueryResult<DriveResult<'listQuotas'>> {
  return useScreenQuery({
    queryKey: driveKey('quotas', null),
    queryFn: ({ signal }) => listDriveQuotas(signal),
    enabled,
    retry: false,
  });
}

export function useDriveBackupStatus(
  enabled: boolean,
): UseQueryResult<DriveResult<'readBackupStatus'>> {
  return useScreenQuery({
    queryKey: driveKey('backup', null),
    queryFn: ({ signal }) => readDriveBackupStatus(signal),
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
        : ({ signal }): Promise<DriveResult<'listGrants'>> => listDriveGrants(itemId, signal),
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
    read: (cursor, signal) => listDriveZipEntries(itemId, cursor, signal),
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
        : ({ signal }): Promise<DriveZipEntryLink> =>
            readDriveZipEntryLink(itemId, index, { signal }),
    retry: false,
  });
}

export function useDriveItemText(
  itemId: string | null,
  rev: number,
): UseQueryResult<DriveItemText> {
  return useScreenQuery<DriveItemText>({
    queryKey: driveKey('item-text', DRIVE_EVERYWHERE, itemId, rev),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): Promise<DriveItemText> => readDriveItemText(itemId, signal),
    retry: false,
  });
}

export function useDriveOpenItem(itemId: string | null): UseQueryResult<DriveOpenItem> {
  return useScreenQuery<DriveOpenItem>({
    queryKey: driveKey('open-item', DRIVE_EVERYWHERE, itemId),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): Promise<DriveOpenItem> => openDriveItem(itemId, signal),
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
    read: (cursor, signal) => listDriveComments(itemId, cursor, signal),
  });
}

export function useDriveAccessRequests(
  box: DriveAccessBox,
): DrivePages<DriveResult<'listDriveAccessRequests'>> {
  return useDrivePages({
    queryKey: driveKey('access-requests', DRIVE_EVERYWHERE, box),
    read: (cursor, signal) => listDriveAccessRequests(box, cursor, signal),
  });
}

export function useDriveFileRequests(
  folderItemId: string | null,
): DrivePages<DriveResult<'listFileRequests'>> {
  return useDrivePages({
    queryKey: driveKey('file-requests', DRIVE_EVERYWHERE, folderItemId),
    read: (cursor, signal) => listDriveFileRequests(folderItemId, cursor, signal),
  });
}

export function useDriveFileRequestUploads(
  fileRequestId: string,
): DrivePages<DriveResult<'listFileRequestUploads'>> {
  return useDrivePages({
    queryKey: driveKey('file-request-uploads', DRIVE_EVERYWHERE, fileRequestId),
    read: (cursor, signal) => listDriveFileRequestUploads(fileRequestId, cursor, signal),
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
    read: (cursor, signal) => listDriveOffline(clientId, cursor, signal),
  });
}
