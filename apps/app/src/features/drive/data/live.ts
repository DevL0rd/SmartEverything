import type { QueryClient } from '@tanstack/react-query';
import type { LiveChange, PhotosProgressNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { DRIVE_PREFIX, type DriveWindowKind } from '../../../queries/keys';
import { clearDriveProgress } from './progress';
import { invalidateDriveReach } from './windows';

const NO_IDS: readonly string[] = [];

type RootChange = Extract<LiveChange, { readonly table: 'drive_roots' }>;
type AlbumChange = Extract<LiveChange, { readonly table: 'drive_albums' }>;
type TransferChange = Extract<LiveChange, { readonly table: 'drive_transfers' }>;

export function invalidateDriveKinds(client: QueryClient, kinds: readonly DriveWindowKind[]): void {
  background(
    client.invalidateQueries({
      queryKey: DRIVE_PREFIX,
      predicate: (query) => kinds.some((kind) => query.queryKey[2] === kind),
    }),
    'queries.invalidate_failed',
  );
}

export function invalidateDriveItemKind(
  client: QueryClient,
  kind: DriveWindowKind,
  itemId: string,
): void {
  background(
    client.invalidateQueries({
      queryKey: [...DRIVE_PREFIX, kind],
      predicate: (query) => query.queryKey[4] === itemId,
    }),
    'queries.invalidate_failed',
  );
}

export function invalidateAllDrive(client: QueryClient): void {
  background(client.invalidateQueries({ queryKey: DRIVE_PREFIX }), 'queries.invalidate_failed');
}

function rootChanged(client: QueryClient, change: RootChange): void {
  if (change.operation !== 'UPDATE') {
    invalidateAllDrive(client);
    return;
  }
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null || record.state === oldRecord.state) return;
  invalidateDriveReach(client, {
    rootIds: [record.id],
    folderIds: NO_IDS,
    albumIds: NO_IDS,
    months: null,
  });
}

function albumChanged(client: QueryClient, change: AlbumChange): void {
  const album = change.record ?? change.oldRecord;
  if (album === null) return;
  invalidateDriveReach(
    client,
    { rootIds: NO_IDS, folderIds: NO_IDS, albumIds: [album.id], months: null },
    ['album-items'],
  );
}

function transferChanged(client: QueryClient, change: TransferChange): void {
  invalidateDriveKinds(client, ['transfers']);
  const { record, oldRecord } = change;
  if (record?.state === 'accepted' || oldRecord?.state === 'accepted') invalidateAllDrive(client);
}

export function applyDriveChanges(client: QueryClient, changes: readonly LiveChange[]): void {
  for (const change of changes) {
    if (change.table === 'drive_roots') rootChanged(client, change);
    else if (change.table === 'drive_grants') invalidateAllDrive(client);
    else if (change.table === 'drive_albums') albumChanged(client, change);
    else if (change.table === 'drive_access_requests')
      invalidateDriveKinds(client, ['access-requests', 'open-item']);
    else if (change.table === 'drive_file_requests')
      invalidateDriveKinds(client, ['file-requests', 'file-request-uploads']);
    else if (change.table === 'drive_transfers') transferChanged(client, change);
    else if (change.table === 'drive_offline_items') invalidateDriveKinds(client, ['offline']);
  }
}

export function driveReconnected(client: QueryClient): void {
  clearDriveProgress();
  invalidateAllDrive(client);
}

export type PhotosProgressListener = (notice: PhotosProgressNotice) => void;

const photosProgressListeners = new Set<PhotosProgressListener>();

export function onPhotosProgress(listener: PhotosProgressListener): () => void {
  photosProgressListeners.add(listener);
  return () => {
    photosProgressListeners.delete(listener);
  };
}

export function receivePhotosProgress(notice: PhotosProgressNotice): void {
  for (const listener of photosProgressListeners) listener(notice);
}
