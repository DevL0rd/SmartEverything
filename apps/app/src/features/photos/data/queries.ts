import { keepPreviousData, skipToken, type UseQueryResult } from '@tanstack/react-query';
import type {
  LibraryScope,
  PhotoInsightRange,
  PhotoSource,
  PlaceClusterQuery,
} from '@smarteverything/domain';
import {
  type PhotosResult,
  type SourceSearch,
  listPhotoBusiestDays,
  listPhotoLargestVideos,
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
  readLibraryBuckets,
  readLibraryPage,
} from '../../../api/photos';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDrivePages, type DrivePages } from '../../drive';
import { useFolderScope } from '../folders/data';
import { photoKeys } from './keys';

export function usePhotoBuckets(
  requested: LibraryScope,
): UseQueryResult<PhotosResult<'readLibraryBuckets'>> {
  const scope = useFolderScope(requested);
  return useScreenQuery({
    queryKey: photoKeys.buckets(scope),
    queryFn: ({ signal }) => readLibraryBuckets(scope, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoMonth(
  month: string,
  requested: LibraryScope,
  enabled: boolean,
): DrivePages<PhotosResult<'readLibraryPage'>> {
  const scope = useFolderScope(requested);
  return useDrivePages({
    queryKey: photoKeys.month(month, scope),
    read: (cursor, signal) => readLibraryPage(month, scope, cursor, signal),
    enabled,
  });
}

export function usePhotoMedia(
  itemId: string | null,
): UseQueryResult<PhotosResult<'readMediaInfo'>> {
  return useScreenQuery({
    queryKey: photoKeys.media(itemId),
    queryFn:
      itemId === null
        ? skipToken
        : ({ signal }): ReturnType<typeof readMediaInfo> => readMediaInfo(itemId, signal),
    retry: false,
  });
}

export function usePhotoRailCounts(): UseQueryResult<PhotosResult<'readPhotoRailCounts'>> {
  return useScreenQuery({
    queryKey: photoKeys.railCounts(),
    queryFn: ({ signal }) => readPhotoRailCounts(signal),
    retry: false,
  });
}

export function usePhotoProcessing(): UseQueryResult<PhotosResult<'readMediaProcessing'>> {
  return useScreenQuery({
    queryKey: photoKeys.processing(),
    queryFn: ({ signal }) => readMediaProcessing(signal),
    retry: false,
  });
}

export function usePhotoTrips(): UseQueryResult<PhotosResult<'listTrips'>> {
  return useScreenQuery({
    queryKey: photoKeys.trips(),
    queryFn: ({ signal }) => listTrips(signal),
    retry: false,
  });
}

export function usePhotoPlaces(): UseQueryResult<PhotosResult<'listPlaces'>> {
  return useScreenQuery({
    queryKey: photoKeys.places(),
    queryFn: ({ signal }) => listPlaces(signal),
    retry: false,
  });
}

export function usePhotoPlace(placeId: number | null): UseQueryResult<PhotosResult<'readPlace'>> {
  return useScreenQuery({
    queryKey: photoKeys.place(placeId),
    queryFn:
      placeId === null
        ? skipToken
        : ({ signal }): ReturnType<typeof readPlace> => readPlace(placeId, signal),
    retry: false,
  });
}

export function usePhotoClusters(
  query: PlaceClusterQuery,
  enabled: boolean,
): UseQueryResult<PhotosResult<'listPlaceClusters'>> {
  return useScreenQuery({
    queryKey: photoKeys.clusters(query),
    queryFn: ({ signal }) => listPlaceClusters(query, signal),
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
    queryFn: ({ signal }) => readPhotoInsights(range, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoLargestVideos(
  range: PhotoInsightRange,
): DrivePages<PhotosResult<'listPhotoLargestVideos'>> {
  return useDrivePages({
    queryKey: photoKeys.largestVideos(range),
    read: (cursor, signal) => listPhotoLargestVideos(range, cursor, signal),
  });
}

export function usePhotoBusiestDays(
  range: PhotoInsightRange,
): DrivePages<PhotosResult<'listPhotoBusiestDays'>> {
  return useDrivePages({
    queryKey: photoKeys.busiestDays(range),
    read: (cursor, signal) => listPhotoBusiestDays(range, cursor, signal),
  });
}

export function usePhotoStacks(): DrivePages<PhotosResult<'listStacks'>> {
  return useDrivePages({ queryKey: photoKeys.stacks(), read: listStacks });
}

export function usePhotoStack(stackId: string | null): UseQueryResult<PhotosResult<'readStack'>> {
  return useScreenQuery({
    queryKey: photoKeys.stack(stackId),
    queryFn:
      stackId === null
        ? skipToken
        : ({ signal }): ReturnType<typeof readStack> => readStack(stackId, signal),
    retry: false,
  });
}

export function usePhotoSource(
  source: PhotoSource,
  chipId: string | null,
  search: SourceSearch,
): DrivePages<PhotosResult<'listPhotoSource'>> {
  return useDrivePages({
    queryKey: photoKeys.source(source, chipId, search),
    read: (cursor, signal) => listPhotoSource(source, chipId, search, { cursor, signal }),
  });
}

export function usePhotoBackupState(): UseQueryResult<PhotosResult<'readBackupState'>> {
  return useScreenQuery({
    queryKey: photoKeys.backup(),
    queryFn: ({ signal }) => readBackupState(signal),
    retry: false,
  });
}

export function usePhotoDuplicates(): DrivePages<PhotosResult<'listPhotoDuplicates'>> {
  return useDrivePages({ queryKey: photoKeys.duplicates(), read: listPhotoDuplicates });
}

export function usePhotoDuplicateStats(): UseQueryResult<PhotosResult<'readPhotoDuplicateStats'>> {
  return useScreenQuery({
    queryKey: photoKeys.duplicateStats(),
    queryFn: ({ signal }) => readPhotoDuplicateStats(signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
