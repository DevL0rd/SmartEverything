import type { QueryClient } from '@tanstack/react-query';
import type { LiveChange, PhotosProgressNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { DRIVE_PREFIX } from '../../../queries/keys';
import { clearDriveProgress } from './progress';
import { invalidateDriveReach } from './windows';

const NO_IDS: readonly string[] = [];

type RootChange = Extract<LiveChange, { readonly table: 'drive_roots' }>;
type AlbumChange = Extract<LiveChange, { readonly table: 'drive_albums' }>;

function invalidateAll(client: QueryClient): void {
  background(client.invalidateQueries({ queryKey: DRIVE_PREFIX }), 'queries.invalidate_failed');
}

function rootChanged(client: QueryClient, change: RootChange): void {
  if (change.operation !== 'UPDATE') {
    invalidateAll(client);
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

export function applyDriveChanges(client: QueryClient, changes: readonly LiveChange[]): void {
  for (const change of changes) {
    if (change.table === 'drive_roots') rootChanged(client, change);
    else if (change.table === 'drive_albums') albumChanged(client, change);
  }
}

export function driveReconnected(client: QueryClient): void {
  clearDriveProgress();
  invalidateAll(client);
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
