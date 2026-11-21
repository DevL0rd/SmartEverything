import { useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { LibraryScope, PhotoFolderHide } from '@smarteverything/domain';
import {
  listHiddenPhotoFolders,
  listPhotoFolders,
  setPhotoFolderHidden,
} from '../../../api/photo-folders';
import type { PhotosResult } from '../../../api/photos';
import { useValue, ValueStore } from '../../../design/external-store';
import { DRIVE_EVERYWHERE, driveKey, type DriveWindowKind } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { invalidateDriveKinds } from '../../drive';

export const folderKeys = {
  folders: (): readonly unknown[] => driveKey('photo-folders', DRIVE_EVERYWHERE),
  hidden: (): readonly unknown[] => driveKey('photo-hidden-folders', DRIVE_EVERYWHERE),
};

export const FOLDER_VIEW_KINDS: readonly DriveWindowKind[] = [
  'photo-buckets',
  'photo-month',
  'photo-folders',
  'photo-hidden-folders',
  'photo-places',
  'photo-place',
  'photo-clusters',
  'photo-trips',
];

export const showAllFolders = new ValueStore<boolean>(false);

export function useShowAllFolders(): boolean {
  return useValue(showAllFolders);
}

export function withFolderShow(scope: LibraryScope, all: boolean): LibraryScope {
  return all && scope.folder === undefined ? { ...scope, folders: 'all' } : scope;
}

export function useFolderScope(scope: LibraryScope): LibraryScope {
  const all = useShowAllFolders();
  return useMemo(() => withFolderShow(scope, all), [scope, all]);
}

export function usePhotoFolders(): UseQueryResult<PhotosResult<'listPhotoFolders'>> {
  return useScreenQuery({
    queryKey: folderKeys.folders(),
    queryFn: ({ signal }) => listPhotoFolders(signal),
  });
}

export function useHiddenFolders(): UseQueryResult<PhotosResult<'listHiddenPhotoFolders'>> {
  return useScreenQuery({
    queryKey: folderKeys.hidden(),
    queryFn: ({ signal }) => listHiddenPhotoFolders(signal),
  });
}

const NO_KEYS: ReadonlySet<string> = new Set();

export function useHiddenFolderKeys(): ReadonlySet<string> {
  const data = useHiddenFolders().data;
  return useMemo(
    () => (data === undefined ? NO_KEYS : new Set(data.folders.map((folder) => folder.key))),
    [data],
  );
}

export function invalidateFolderViews(client: QueryClient): void {
  invalidateDriveKinds(client, FOLDER_VIEW_KINDS);
}

export async function changeFolderHidden(
  client: QueryClient,
  change: PhotoFolderHide,
): Promise<void> {
  const hidden = await setPhotoFolderHidden(change);
  client.setQueryData(folderKeys.hidden(), hidden);
  invalidateFolderViews(client);
}

export function useFolderHiding(): (change: PhotoFolderHide) => Promise<void> {
  const client = useQueryClient();
  return (change) => changeFolderHidden(client, change);
}
