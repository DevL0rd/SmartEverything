import {
  skipToken,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PhotoGroupKind } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PhotosResult } from '../../../api/photos';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { photoKeys } from '../data/keys';
import { listPhotoGroups, readPhotoFaces, readPhotoGroup } from './api';

export function usePhotoPeople(
  kind: PhotoGroupKind | null = null,
): UseQueryResult<PhotosResult<'listPhotoGroups'>> {
  return useScreenQuery({
    queryKey: photoKeys.people(kind),
    queryFn: (): Promise<PhotosResult<'listPhotoGroups'>> => listPhotoGroups(kind),
    retry: false,
  });
}

export function usePhotoGroup(
  groupId: string | null,
): UseQueryResult<PhotosResult<'readPhotoGroup'>> {
  return useScreenQuery({
    queryKey: photoKeys.group(groupId),
    queryFn:
      groupId === null
        ? skipToken
        : (): Promise<PhotosResult<'readPhotoGroup'>> => readPhotoGroup(groupId),
    retry: false,
  });
}

export function usePhotoFaces(
  itemId: string | null,
): UseQueryResult<PhotosResult<'readPhotoFaces'>> {
  return useScreenQuery({
    queryKey: photoKeys.faces(itemId),
    queryFn:
      itemId === null
        ? skipToken
        : (): Promise<PhotosResult<'readPhotoFaces'>> => readPhotoFaces(itemId),
    retry: false,
  });
}

export function invalidatePeople(client: QueryClient): void {
  for (const kind of ['photo-people', 'photo-suggest', 'photo-buckets', 'photo-month'] as const) {
    background(
      client.invalidateQueries({ queryKey: driveKey(kind, DRIVE_EVERYWHERE) }),
      'photos.people.invalidate_failed',
      { kind },
    );
  }
  background(
    client.invalidateQueries({
      predicate: (query) => query.queryKey.at(-1) === 'faces',
    }),
    'photos.people.invalidate_failed',
    { kind: 'faces' },
  );
}

export function usePeopleRefresh(): () => void {
  const client = useQueryClient();
  return (): void => {
    invalidatePeople(client);
  };
}
