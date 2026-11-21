import {
  API_ENDPOINTS as E,
  type DRIVE_BROWSE_QUERY,
  type DriveAccessBox,
  type DriveQuery,
  type DriveRecentFilter,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { DriveResult } from './drive';
import { api } from './transport';

type BrowseQuery = z.infer<typeof DRIVE_BROWSE_QUERY>;

type Call<K extends keyof typeof E> = Promise<DriveResult<K>>;

export function browseDrive(query: BrowseQuery, signal: AbortSignal): Call<'browseFolder'> {
  return api().call(E.browseFolder, { query }, { signal });
}

export function searchDrive(body: DriveQuery, signal: AbortSignal): Call<'searchDrive'> {
  return api().call(E.searchDrive, { body }, { signal });
}

export function readDriveRecent(
  filter: DriveRecentFilter,
  cursor: string | null,
  signal: AbortSignal,
): Call<'readRecent'> {
  return api().call(
    E.readRecent,
    {
      query: cursor === null ? { filter } : { filter, cursor },
    },
    { signal },
  );
}

export function listDriveDuplicates(
  rootId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listDuplicates'> {
  return api().call(E.listDuplicates, { query: pageQuery(rootId, cursor) }, { signal });
}

export function listDriveAlbumItems(
  albumId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listAlbumItems'> {
  return api().call(
    E.listAlbumItems,
    {
      params: { albumId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveTrash(
  rootId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listTrash'> {
  return api().call(E.listTrash, { query: pageQuery(rootId, cursor) }, { signal });
}

export function listDriveVersions(
  itemId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listVersions'> {
  return api().call(
    E.listVersions,
    {
      params: { itemId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveActivity(
  from: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listDriveActivity'> {
  return api().call(
    E.listDriveActivity,
    {
      query: { from, ...(cursor === null ? {} : { cursor }) },
    },
    { signal },
  );
}

export function listDriveItemActivity(
  itemId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listItemActivity'> {
  return api().call(
    E.listItemActivity,
    {
      params: { itemId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveShares(
  itemId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listShares'> {
  return api().call(
    E.listShares,
    {
      query: {
        ...(itemId === null ? {} : { itemId }),
        ...(cursor === null ? {} : { cursor }),
      },
    },
    { signal },
  );
}

export function listDriveConflicts(
  rootId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listConflicts'> {
  return api().call(E.listConflicts, { query: pageQuery(rootId, cursor) }, { signal });
}

export function listDriveSharedWithMe(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listSharedWithMe'> {
  return api().call(E.listSharedWithMe, { query: cursor === null ? {} : { cursor } }, { signal });
}

export function listDriveSharedByMe(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listSharedByMe'> {
  return api().call(E.listSharedByMe, { query: cursor === null ? {} : { cursor } }, { signal });
}

export function listDriveZipEntries(
  itemId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listZipEntries'> {
  return api().call(
    E.listZipEntries,
    {
      params: { itemId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveSuggested(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listSuggested'> {
  return api().call(E.listSuggested, { query: cursor === null ? {} : { cursor } }, { signal });
}

export function listDriveComments(
  itemId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listComments'> {
  return api().call(
    E.listComments,
    {
      params: { itemId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveAccessRequests(
  box: DriveAccessBox,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listDriveAccessRequests'> {
  return api().call(
    E.listDriveAccessRequests,
    {
      query: cursor === null ? { box } : { box, cursor },
    },
    { signal },
  );
}

export function listDriveFileRequests(
  folderItemId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listFileRequests'> {
  return api().call(
    E.listFileRequests,
    {
      query: {
        ...(folderItemId === null ? {} : { folderItemId }),
        ...(cursor === null ? {} : { cursor }),
      },
    },
    { signal },
  );
}

export function listDriveFileRequestUploads(
  fileRequestId: string,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listFileRequestUploads'> {
  return api().call(
    E.listFileRequestUploads,
    {
      params: { fileRequestId },
      query: cursor === null ? {} : { cursor },
    },
    { signal },
  );
}

export function listDriveNotifications(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listNotifications'> {
  return api().call(E.listNotifications, { query: cursor === null ? {} : { cursor } }, { signal });
}

export function listDriveTransfers(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listTransfers'> {
  return api().call(E.listTransfers, { query: cursor === null ? {} : { cursor } }, { signal });
}

export function listDriveOffline(
  clientId: string | null,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listOffline'> {
  return api().call(
    E.listOffline,
    {
      query: {
        ...(clientId === null ? {} : { clientId }),
        ...(cursor === null ? {} : { cursor }),
      },
    },
    { signal },
  );
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
