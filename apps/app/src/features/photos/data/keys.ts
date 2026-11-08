import type { PhotoInsightRange, PhotoSource, PlaceClusterQuery } from '@smarteverything/domain';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import type { PhotoScope } from '../../../api/photos';

export const PHOTO_ALL: PhotoScope = { filter: 'all', placeId: null };

export const photoKeys = {
  buckets: (scope: PhotoScope): readonly unknown[] =>
    driveKey('photo-buckets', DRIVE_EVERYWHERE, scope),
  month: (month: string, scope: PhotoScope): readonly unknown[] =>
    driveKey('photo-month', DRIVE_EVERYWHERE, month, scope),
  media: (itemId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId),
  processing: (): readonly unknown[] => driveKey('photo-processing', DRIVE_EVERYWHERE),
  memories: (): readonly unknown[] => driveKey('photo-memories', DRIVE_EVERYWHERE),
  memoryItems: (memoryId: string): readonly unknown[] =>
    driveKey('photo-memory-items', DRIVE_EVERYWHERE, memoryId),
  trips: (): readonly unknown[] => driveKey('photo-trips', DRIVE_EVERYWHERE),
  places: (): readonly unknown[] => driveKey('photo-places', DRIVE_EVERYWHERE),
  place: (placeId: number | null): readonly unknown[] =>
    driveKey('photo-place', DRIVE_EVERYWHERE, placeId),
  clusters: (query: PlaceClusterQuery): readonly unknown[] =>
    driveKey('photo-clusters', DRIVE_EVERYWHERE, query),
  insights: (range: PhotoInsightRange): readonly unknown[] =>
    driveKey('photo-insights', DRIVE_EVERYWHERE, range),
  railCounts: (): readonly unknown[] => driveKey('photo-rail-counts', DRIVE_EVERYWHERE),
  stacks: (): readonly unknown[] => driveKey('photo-stacks', DRIVE_EVERYWHERE),
  stack: (stackId: string | null): readonly unknown[] =>
    driveKey('photo-stack', DRIVE_EVERYWHERE, stackId),
  source: (source: PhotoSource, chipId: string | null): readonly unknown[] =>
    driveKey('photo-sources', DRIVE_EVERYWHERE, source, chipId),
  backup: (): readonly unknown[] => driveKey('photo-backup', DRIVE_EVERYWHERE),
  duplicates: (): readonly unknown[] => driveKey('photo-duplicates', DRIVE_EVERYWHERE),
  duplicateStats: (): readonly unknown[] => driveKey('photo-duplicate-stats', DRIVE_EVERYWHERE),
  search: (query: unknown): readonly unknown[] => driveKey('photo-search', DRIVE_EVERYWHERE, query),
};
