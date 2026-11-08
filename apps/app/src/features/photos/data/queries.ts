import { keepPreviousData, skipToken, type UseQueryResult } from '@tanstack/react-query';
import type {
  DriveQueryPage,
  PhotoInsightRange,
  PhotoSource,
  PlaceClusterQuery,
} from '@smarteverything/domain';
import {
  type PhotoScope,
  type PhotosResult,
  listMemories,
  listMemoryItems,
  listPhotoSource,
  listPlaceClusters,
  listPhotoDuplicates,
  listPlaces,
  listStacks,
  listTrips,
  readBackupState,
  readMediaInfo,
  readMediaProcessing,
  readPhotoDuplicateStats,
  readPhotoInsights,
  readPhotoRailCounts,
  readPlace,
  readStack,
  readTimelineBuckets,
  readTimelinePage,
} from '../../../api/photos';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDrivePages, type DrivePages } from '../../nas/data/pages';
import { photoKeys } from './keys';

export function usePhotoBuckets(
  scope: PhotoScope,
): UseQueryResult<PhotosResult<'readTimelineBuckets'>> {
  return useScreenQuery({
    queryKey: photoKeys.buckets(scope),
    queryFn: () => readTimelineBuckets(scope),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoMonth(
  month: string,
  scope: PhotoScope,
  enabled: boolean,
): DrivePages<PhotosResult<'readTimelinePage'>> {
  return useDrivePages({
    queryKey: photoKeys.month(month, scope),
    read: (cursor) => readTimelinePage(month, scope, cursor),
    enabled,
  });
}

export function usePhotoMedia(
  itemId: string | null,
): UseQueryResult<PhotosResult<'readMediaInfo'>> {
  return useScreenQuery({
    queryKey: photoKeys.media(itemId),
    queryFn:
      itemId === null ? skipToken : (): ReturnType<typeof readMediaInfo> => readMediaInfo(itemId),
    retry: false,
  });
}

export function usePhotoRailCounts(): UseQueryResult<PhotosResult<'readPhotoRailCounts'>> {
  return useScreenQuery({
    queryKey: photoKeys.railCounts(),
    queryFn: readPhotoRailCounts,
    retry: false,
  });
}

export function usePhotoProcessing(): UseQueryResult<PhotosResult<'readMediaProcessing'>> {
  return useScreenQuery({
    queryKey: photoKeys.processing(),
    queryFn: readMediaProcessing,
    retry: false,
  });
}

export function usePhotoMemories(): UseQueryResult<PhotosResult<'listMemories'>> {
  return useScreenQuery({
    queryKey: photoKeys.memories(),
    queryFn: listMemories,
    retry: false,
  });
}

export function usePhotoMemoryItems(memoryId: string): DrivePages<DriveQueryPage> {
  return useDrivePages({
    queryKey: photoKeys.memoryItems(memoryId),
    read: (cursor) => listMemoryItems(memoryId, cursor),
  });
}

export function usePhotoTrips(): UseQueryResult<PhotosResult<'listTrips'>> {
  return useScreenQuery({ queryKey: photoKeys.trips(), queryFn: listTrips, retry: false });
}

export function usePhotoPlaces(): UseQueryResult<PhotosResult<'listPlaces'>> {
  return useScreenQuery({ queryKey: photoKeys.places(), queryFn: listPlaces, retry: false });
}

export function usePhotoPlace(placeId: number | null): UseQueryResult<PhotosResult<'readPlace'>> {
  return useScreenQuery({
    queryKey: photoKeys.place(placeId),
    queryFn: placeId === null ? skipToken : (): ReturnType<typeof readPlace> => readPlace(placeId),
    retry: false,
  });
}

export function usePhotoClusters(
  query: PlaceClusterQuery,
  enabled: boolean,
): UseQueryResult<PhotosResult<'listPlaceClusters'>> {
  return useScreenQuery({
    queryKey: photoKeys.clusters(query),
    queryFn: () => listPlaceClusters(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoInsights(
  range: PhotoInsightRange,
): UseQueryResult<PhotosResult<'readPhotoInsights'>> {
  return useScreenQuery({
    queryKey: photoKeys.insights(range),
    queryFn: () => readPhotoInsights(range),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoStacks(): DrivePages<PhotosResult<'listStacks'>> {
  return useDrivePages({ queryKey: photoKeys.stacks(), read: listStacks });
}

export function usePhotoStack(stackId: string | null): UseQueryResult<PhotosResult<'readStack'>> {
  return useScreenQuery({
    queryKey: photoKeys.stack(stackId),
    queryFn: stackId === null ? skipToken : (): ReturnType<typeof readStack> => readStack(stackId),
    retry: false,
  });
}

export function usePhotoSource(
  source: PhotoSource,
  chipId: string | null,
): DrivePages<PhotosResult<'listPhotoSource'>> {
  return useDrivePages({
    queryKey: photoKeys.source(source, chipId),
    read: (cursor) => listPhotoSource(source, chipId, cursor),
  });
}

export function usePhotoBackupState(): UseQueryResult<PhotosResult<'readBackupState'>> {
  return useScreenQuery({
    queryKey: photoKeys.backup(),
    queryFn: readBackupState,
    retry: false,
  });
}

export function usePhotoDuplicates(): DrivePages<PhotosResult<'listPhotoDuplicates'>> {
  return useDrivePages({ queryKey: photoKeys.duplicates(), read: listPhotoDuplicates });
}

export function usePhotoDuplicateStats(): UseQueryResult<PhotosResult<'readPhotoDuplicateStats'>> {
  return useScreenQuery({
    queryKey: photoKeys.duplicateStats(),
    queryFn: readPhotoDuplicateStats,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
