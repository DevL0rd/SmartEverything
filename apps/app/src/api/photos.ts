import {
  PHOTOS_ENDPOINTS as P,
  type BackupHave,
  type BackupRegister,
  type DuplicateKeepBest,
  type PhotoInsightRange,
  type PhotoSource,
  type PhotoTimelineFilter,
  type PlaceClusterQuery,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

export type PhotosResult<K extends keyof typeof P> = z.output<(typeof P)[K]['response']>;

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export interface PhotoScope {
  readonly filter: PhotoTimelineFilter;
  readonly placeId: number | null;
}

function scopeQuery(scope: PhotoScope): {
  readonly filter: PhotoTimelineFilter;
  readonly placeId?: number;
} {
  return {
    filter: scope.filter,
    ...(scope.placeId === null ? {} : { placeId: scope.placeId }),
  };
}

function cursorQuery(cursor: string | null): { readonly cursor?: string } {
  return cursor === null ? {} : { cursor };
}

export function readTimelineBuckets(scope: PhotoScope): Call<'readTimelineBuckets'> {
  return api().call(P.readTimelineBuckets, { query: scopeQuery(scope) });
}

export function readTimelinePage(
  month: string,
  scope: PhotoScope,
  cursor: string | null,
): Call<'readTimelinePage'> {
  return api().call(P.readTimelinePage, {
    params: { month },
    query: { ...scopeQuery(scope), ...cursorQuery(cursor) },
  });
}

export function readMediaInfo(itemId: string): Call<'readMediaInfo'> {
  return api().call(P.readMediaInfo, { params: { itemId } });
}

export function readMediaProcessing(): Call<'readMediaProcessing'> {
  return api().call(P.readMediaProcessing, {});
}

export function listMemories(): Call<'listMemories'> {
  return api().call(P.listMemories, {});
}

export function listMemoryItems(memoryId: string, cursor: string | null): Call<'listMemoryItems'> {
  return api().call(P.listMemoryItems, { params: { memoryId }, query: cursorQuery(cursor) });
}

export function listTrips(): Call<'listTrips'> {
  return api().call(P.listTrips, {});
}

export function listPlaces(): Call<'listPlaces'> {
  return api().call(P.listPlaces, {});
}

export function readPlace(placeId: number): Call<'readPlace'> {
  return api().call(P.readPlace, { params: { placeId: String(placeId) } });
}

export function listPlaceClusters(query: PlaceClusterQuery): Call<'listPlaceClusters'> {
  return api().call(P.listPlaceClusters, { query });
}

export function readPhotoRailCounts(): Call<'readPhotoRailCounts'> {
  return api().call(P.readPhotoRailCounts, {});
}

export function readPhotoInsights(range: PhotoInsightRange): Call<'readPhotoInsights'> {
  return api().call(P.readPhotoInsights, { query: { range } });
}

export function listPhotoDuplicates(cursor: string | null): Call<'listPhotoDuplicates'> {
  return api().call(P.listPhotoDuplicates, { query: cursorQuery(cursor) });
}

export function readPhotoDuplicateStats(): Call<'readPhotoDuplicateStats'> {
  return api().call(P.readPhotoDuplicateStats, {});
}

export function keepBestDuplicates(body: DuplicateKeepBest): Call<'keepBestDuplicates'> {
  return api().call(P.keepBestDuplicates, { body });
}

export function markNotDuplicates(sha256s: readonly string[]): Call<'markNotDuplicates'> {
  return api().call(P.markNotDuplicates, { body: { sha256s } });
}

export function listStacks(cursor: string | null): Call<'listStacks'> {
  return api().call(P.listStacks, { query: cursorQuery(cursor) });
}

export function readStack(stackId: string): Call<'readStack'> {
  return api().call(P.readStack, { params: { stackId } });
}

export function makeStackCover(stackId: string, itemId: string): Call<'makeStackCover'> {
  return api().call(P.makeStackCover, { params: { stackId }, body: { itemId } });
}

export function listPhotoSource(
  source: PhotoSource,
  chipId: string | null,
  cursor: string | null,
): Call<'listPhotoSource'> {
  return api().call(P.listPhotoSource, {
    params: { source },
    query: { ...(chipId === null ? {} : { chipId }), ...cursorQuery(cursor) },
  });
}

export function keepSourceItems(
  source: PhotoSource,
  itemIds: readonly string[],
): Call<'keepSourceItems'> {
  return api().call(P.keepSourceItems, { params: { source }, body: { itemIds } });
}

export function registerBackupDevice(body: BackupRegister): Call<'registerBackupDevice'> {
  return api().call(P.registerBackupDevice, { body });
}

export function checkBackupHashes(body: BackupHave): Call<'checkBackupHashes'> {
  return api().call(P.checkBackupHashes, { body });
}

export function readBackupState(): Call<'readBackupState'> {
  return api().call(P.readBackupState, {});
}
