import {
  API_ENDPOINTS as E,
  type DRIVE_BROWSE_QUERY,
  type DriveAlbumChange,
  type DriveAlbumCreate,
  type DriveBackupReportInput,
  type DriveChange,
  type DriveConflictResolve,
  type DriveQuery,
  type DriveQuotaSet,
  type DriveRecentFilter,
  type DriveRootAdd,
  type DriveRootChange,
  type DriveSettingsUpdate,
  type DriveShareCreate,
  type DriveShareUnlock,
  type DriveSyncClientUpdate,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

type BrowseQuery = z.infer<typeof DRIVE_BROWSE_QUERY>;

export type DriveResult<K extends keyof typeof E> = z.output<(typeof E)[K]['response']>;

type Call<K extends keyof typeof E> = Promise<DriveResult<K>>;

export function listDriveRoots(): Call<'listRoots'> {
  return api().call(E.listRoots, {});
}

export function addDriveRoot(body: DriveRootAdd): Call<'addRoot'> {
  return api().call(E.addRoot, { body });
}

export function updateDriveRoot(rootId: string, body: DriveRootChange): Call<'updateRoot'> {
  return api().call(E.updateRoot, { params: { rootId }, body });
}

export function removeDriveRoot(rootId: string): Call<'removeRoot'> {
  return api().call(E.removeRoot, { params: { rootId } });
}

export function scanDriveRoot(rootId: string): Call<'scanRoot'> {
  return api().call(E.scanRoot, { params: { rootId } });
}

export function listDriveVolumes(): Call<'listVolumes'> {
  return api().call(E.listVolumes, {});
}

export function browseDrive(query: BrowseQuery): Call<'browseFolder'> {
  return api().call(E.browseFolder, { query });
}

export function readDriveItem(itemId: string): Call<'readItem'> {
  return api().call(E.readItem, { params: { itemId } });
}

export function readDriveLinks(itemIds: readonly string[]): Call<'itemLinks'> {
  return api().call(E.itemLinks, { body: { itemIds: [...itemIds] } });
}

export function searchDrive(body: DriveQuery): Call<'searchDrive'> {
  return api().call(E.searchDrive, { body });
}

export function changeDrive(body: DriveChange): Call<'changeDrive'> {
  return api().call(E.changeDrive, { body });
}

export function readDriveRecent(
  filter: DriveRecentFilter,
  cursor: string | null,
): Call<'readRecent'> {
  return api().call(E.readRecent, {
    query: cursor === null ? { filter } : { filter, cursor },
  });
}

export function readDriveStats(): Call<'readDriveStats'> {
  return api().call(E.readDriveStats, {});
}

export function listDriveDuplicates(
  rootId: string | null,
  cursor: string | null,
): Call<'listDuplicates'> {
  return api().call(E.listDuplicates, { query: pageQuery(rootId, cursor) });
}

export function listDriveAlbumItems(
  albumId: string,
  cursor: string | null,
): Call<'listAlbumItems'> {
  return api().call(E.listAlbumItems, {
    params: { albumId },
    query: cursor === null ? {} : { cursor },
  });
}

export function createDriveAlbum(body: DriveAlbumCreate): Call<'createAlbum'> {
  return api().call(E.createAlbum, { body });
}

export function updateDriveAlbum(albumId: string, body: DriveAlbumChange): Call<'updateAlbum'> {
  return api().call(E.updateAlbum, { params: { albumId }, body });
}

export function removeDriveAlbum(albumId: string): Call<'removeAlbum'> {
  return api().call(E.removeAlbum, { params: { albumId } });
}

export function listDriveTrash(rootId: string | null, cursor: string | null): Call<'listTrash'> {
  return api().call(E.listTrash, { query: pageQuery(rootId, cursor) });
}

export function listDriveVersions(itemId: string, cursor: string | null): Call<'listVersions'> {
  return api().call(E.listVersions, {
    params: { itemId },
    query: cursor === null ? {} : { cursor },
  });
}

export function listDriveActivity(from: string, cursor: string | null): Call<'listDriveActivity'> {
  return api().call(E.listDriveActivity, {
    query: { from, ...(cursor === null ? {} : { cursor }) },
  });
}

export function listDriveItemActivity(
  itemId: string,
  cursor: string | null,
): Call<'listItemActivity'> {
  return api().call(E.listItemActivity, {
    params: { itemId },
    query: cursor === null ? {} : { cursor },
  });
}

export function restoreDriveVersion(itemId: string, versionId: string): Call<'restoreVersion'> {
  return api().call(E.restoreVersion, { params: { itemId, versionId } });
}

export function listDriveShares(itemId: string | null, cursor: string | null): Call<'listShares'> {
  return api().call(E.listShares, {
    query: {
      ...(itemId === null ? {} : { itemId }),
      ...(cursor === null ? {} : { cursor }),
    },
  });
}

export function createDriveShare(body: DriveShareCreate): Call<'createShare'> {
  return api().call(E.createShare, { body });
}

export function revokeDriveShare(shareId: string): Call<'revokeShare'> {
  return api().call(E.revokeShare, { params: { shareId } });
}

export function unlockDriveShare(token: string, body: DriveShareUnlock): Call<'unlockShare'> {
  return api().call(E.unlockShare, { params: { token }, body });
}

export function readDriveUsage(): Call<'readUsage'> {
  return api().call(E.readUsage, {});
}

export function listDriveQuotas(): Call<'listQuotas'> {
  return api().call(E.listQuotas, {});
}

export function setDriveQuota(body: DriveQuotaSet): Call<'setQuota'> {
  return api().call(E.setQuota, { body });
}

export function readDriveHealth(): Call<'readHealth'> {
  return api().call(E.readHealth, {});
}

export function startDriveScrub(): Call<'startScrub'> {
  return api().call(E.startScrub, {});
}

export function reportDriveBackup(body: DriveBackupReportInput): Call<'reportBackup'> {
  return api().call(E.reportBackup, { body });
}

export function readDriveBackupStatus(): Call<'readBackupStatus'> {
  return api().call(E.readBackupStatus, {});
}

export function listDriveConflicts(
  rootId: string | null,
  cursor: string | null,
): Call<'listConflicts'> {
  return api().call(E.listConflicts, { query: pageQuery(rootId, cursor) });
}

export function resolveDriveConflict(body: DriveConflictResolve): Call<'resolveConflict'> {
  return api().call(E.resolveConflict, { body });
}

export function listDriveSyncClients(): Call<'listSyncClients'> {
  return api().call(E.listSyncClients, {});
}

export function updateDriveSyncClient(body: DriveSyncClientUpdate): Call<'updateSyncClient'> {
  return api().call(E.updateSyncClient, { body });
}

export function readDriveSettings(): Call<'readDriveSettings'> {
  return api().call(E.readDriveSettings, {});
}

export function updateDriveSettings(body: DriveSettingsUpdate): Call<'updateDriveSettings'> {
  return api().call(E.updateDriveSettings, { body });
}

function pageQuery(
  rootId: string | null,
  cursor: string | null,
): { readonly rootId?: string; readonly cursor?: string } {
  return {
    ...(rootId === null ? {} : { rootId }),
    ...(cursor === null ? {} : { cursor }),
  };
}
