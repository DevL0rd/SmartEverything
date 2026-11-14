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
import { photoKeys } from './keys';

export function usePhotoBuckets(
  scope: LibraryScope,
): UseQueryResult<PhotosResult<'readLibraryBuckets'>> {
  return useScreenQuery({
    queryKey: photoKeys.buckets(scope),
    queryFn: () => readLibraryBuckets(scope),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function usePhotoMonth(
  month: string,
  scope: LibraryScope,
  enabled: boolean,
): DrivePages<PhotosResult<'readLibraryPage'>> {
  return useDrivePages({
    queryKey: photoKeys.month(month, scope),
    read: (cursor) => readLibraryPage(month, scope, cursor),
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
  search: SourceSearch,
): DrivePages<PhotosResult<'listPhotoSource'>> {
  return useDrivePages({
    queryKey: photoKeys.source(source, chipId, search),
    read: (cursor) => listPhotoSource(source, chipId, search, cursor),
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
