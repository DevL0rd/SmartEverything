import {
  keepPreviousData,
  skipToken,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { PhotoAiStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { PhotosResult } from '../../../api/photos';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { photoKeys } from '../data/keys';
import { listPhotoAiModels, readPhotoAiStatus, readPhotoAnalysis, suggestPhotoSearch } from './api';

export function usePhotoAiStatus(): UseQueryResult<PhotosResult<'readPhotoAiStatus'>> {
  return useScreenQuery({
    queryKey: photoKeys.aiStatus(),
    queryFn: ({ signal }) => readPhotoAiStatus(signal),
    retry: false,
  });
}

export function usePhotoAiModels(): UseQueryResult<PhotosResult<'listPhotoAiModels'>> {
  return useScreenQuery({
    queryKey: photoKeys.aiModels(),
    queryFn: ({ signal }) => listPhotoAiModels(signal),
    retry: false,
  });
}

export function usePhotoAnalysis(
  itemId: string | null,
): UseQueryResult<PhotosResult<'readPhotoAnalysis'>> {
  return useScreenQuery({
    queryKey: photoKeys.analysis(itemId),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): Promise<PhotosResult<'readPhotoAnalysis'>> =>
            readPhotoAnalysis(itemId, signal),
    retry: false,
  });
}

export function usePhotoSuggestions(q: string): UseQueryResult<PhotosResult<'suggestPhotoSearch'>> {
  const query = q.trim();
  return useScreenQuery({
    queryKey: photoKeys.suggest(query),
    queryFn:
      query === ''
        ? skipToken
        : ({ signal }): Promise<PhotosResult<'suggestPhotoSearch'>> =>
            suggestPhotoSearch(query, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function storeAiStatus(client: QueryClient, status: PhotoAiStatus): void {
  client.setQueryData(photoKeys.aiStatus(), status);
}

export function invalidateAiStatus(client: QueryClient): void {
  background(
    client.invalidateQueries({ queryKey: photoKeys.aiStatus() }),
    'photos.smart.invalidate_failed',
  );
}

export function useAiStatusStore(): (status: PhotoAiStatus) => void {
  const client = useQueryClient();
  return (status): void => {
    storeAiStatus(client, status);
  };
}
