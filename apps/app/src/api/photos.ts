import {
  PHOTOS_ENDPOINTS as P,
  type BackupCheck,
  type BackupRegister,
  type DuplicateKeepBest,
  type PhotoInsightRange,
  type PhotoSource,
  type LibraryScope,
  type PhotoOriginsRequest,
  type PlaceClusterQuery,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { api } from './transport';

export type PhotosResult<K extends keyof typeof P> = z.output<(typeof P)[K]['response']>;

type Call<K extends keyof typeof P> = Promise<PhotosResult<K>>;

export interface SourceSearch {
  readonly text: string | null;
  readonly from: string | null;
  readonly to: string | null;
}

export const NO_SOURCE_SEARCH: SourceSearch = { text: null, from: null, to: null };

export interface PageRead {
  readonly cursor: string | null;
  readonly signal: AbortSignal;
}

function cursorQuery(cursor: string | null): { readonly cursor?: string } {
  return cursor === null ? {} : { cursor };
}

export function readLibraryBuckets(
  scope: LibraryScope,
  signal: AbortSignal,
): Call<'readLibraryBuckets'> {
  return api().call(P.readLibraryBuckets, { query: scope }, { signal });
}

export function readLibraryPage(
  month: string,
  scope: LibraryScope,
  cursor: string | null,
  signal: AbortSignal,
): Call<'readLibraryPage'> {
  return api().call(
    P.readLibraryPage,
    {
      params: { month },
      query: { ...scope, ...cursorQuery(cursor) },
    },
    { signal },
  );
}

export function readMediaInfo(itemId: string, signal: AbortSignal): Call<'readMediaInfo'> {
  return api().call(P.readMediaInfo, { params: { itemId } }, { signal });
}

export function readMediaProcessing(signal: AbortSignal): Call<'readMediaProcessing'> {
  return api().call(P.readMediaProcessing, {}, { signal });
}

export function listTrips(signal: AbortSignal): Call<'listTrips'> {
  return api().call(P.listTrips, {}, { signal });
}

export function listPlaces(signal: AbortSignal): Call<'listPlaces'> {
  return api().call(P.listPlaces, {}, { signal });
}

export function readPlace(placeId: number, signal: AbortSignal): Call<'readPlace'> {
  return api().call(P.readPlace, { params: { placeId: String(placeId) } }, { signal });
}

export function listPlaceClusters(
  query: PlaceClusterQuery,
  signal: AbortSignal,
): Call<'listPlaceClusters'> {
  return api().call(P.listPlaceClusters, { query }, { signal });
}

export function readPhotoRailCounts(signal: AbortSignal): Call<'readPhotoRailCounts'> {
  return api().call(P.readPhotoRailCounts, {}, { signal });
}

export function readPhotoInsights(
  range: PhotoInsightRange,
  signal: AbortSignal,
): Call<'readPhotoInsights'> {
  return api().call(P.readPhotoInsights, { query: { range } }, { signal });
}

export function listPhotoLargestVideos(
  range: PhotoInsightRange,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listPhotoLargestVideos'> {
  return api().call(
    P.listPhotoLargestVideos,
    { query: { range, ...cursorQuery(cursor) } },
    { signal },
  );
}

export function listPhotoBusiestDays(
  range: PhotoInsightRange,
  cursor: string | null,
  signal: AbortSignal,
): Call<'listPhotoBusiestDays'> {
  return api().call(
    P.listPhotoBusiestDays,
    { query: { range, ...cursorQuery(cursor) } },
    { signal },
  );
}

export function listPhotoDuplicates(
  cursor: string | null,
  signal: AbortSignal,
): Call<'listPhotoDuplicates'> {
  return api().call(P.listPhotoDuplicates, { query: cursorQuery(cursor) }, { signal });
}

export function readPhotoDuplicateStats(signal: AbortSignal): Call<'readPhotoDuplicateStats'> {
  return api().call(P.readPhotoDuplicateStats, {}, { signal });
}

export function keepBestDuplicates(body: DuplicateKeepBest): Call<'keepBestDuplicates'> {
  return api().call(P.keepBestDuplicates, { body });
}

export function markNotDuplicates(sha256s: readonly string[]): Call<'markNotDuplicates'> {
  return api().call(P.markNotDuplicates, { body: { sha256s } });
}

export function listStacks(cursor: string | null, signal: AbortSignal): Call<'listStacks'> {
  return api().call(P.listStacks, { query: cursorQuery(cursor) }, { signal });
}

export function readStack(stackId: string, signal: AbortSignal): Call<'readStack'> {
  return api().call(P.readStack, { params: { stackId } }, { signal });
}

export function makeStackCover(stackId: string, itemId: string): Call<'makeStackCover'> {
  return api().call(P.makeStackCover, { params: { stackId }, body: { itemId } });
}

export function listPhotoSource(
  source: PhotoSource,
  chipId: string | null,
  search: SourceSearch,
  { cursor, signal }: PageRead,
): Call<'listPhotoSource'> {
  return api().call(
    P.listPhotoSource,
    {
      params: { source },
      query: {
        ...(chipId === null ? {} : { chipId }),
        ...(search.text === null ? {} : { text: search.text }),
        ...(search.from === null ? {} : { from: search.from }),
        ...(search.to === null ? {} : { to: search.to }),
        ...cursorQuery(cursor),
      },
    },
    { signal },
  );
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

export function checkBackupHashes(body: BackupCheck): Call<'checkBackupHashes'> {
  return api().call(P.checkBackupHashes, { body });
}

export function readBackupState(signal: AbortSignal): Call<'readBackupState'> {
  return api().call(P.readBackupState, {}, { signal });
}

export function readPhotoOrigins(body: PhotoOriginsRequest): Call<'readPhotoOrigins'> {
  return api().call(P.readPhotoOrigins, { body });
}
