import type {
  LibraryScope,
  PhotoGroupKind,
  PhotoInsightRange,
  PhotoSource,
  PlaceClusterQuery,
} from '@smarteverything/domain';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import type { SourceSearch } from '../../../api/photos';

export const PHOTO_ALL: LibraryScope = { filter: 'all' };

export const photoKeys = {
  buckets: (scope: LibraryScope): readonly unknown[] =>
    driveKey('photo-buckets', DRIVE_EVERYWHERE, scope),
  month: (month: string, scope: LibraryScope): readonly unknown[] =>
    driveKey('photo-month', DRIVE_EVERYWHERE, month, scope),
  media: (itemId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId),
  processing: (): readonly unknown[] => driveKey('photo-processing', DRIVE_EVERYWHERE),
  trips: (): readonly unknown[] => driveKey('photo-trips', DRIVE_EVERYWHERE),
  places: (): readonly unknown[] => driveKey('photo-places', DRIVE_EVERYWHERE),
  place: (placeId: number | null): readonly unknown[] =>
    driveKey('photo-place', DRIVE_EVERYWHERE, placeId),
  clusters: (query: PlaceClusterQuery): readonly unknown[] =>
    driveKey('photo-clusters', DRIVE_EVERYWHERE, query),
  insights: (range: PhotoInsightRange): readonly unknown[] =>
    driveKey('photo-insights', DRIVE_EVERYWHERE, range),
  largestVideos: (range: PhotoInsightRange): readonly unknown[] =>
    driveKey('photo-largest-videos', DRIVE_EVERYWHERE, range),
  busiestDays: (range: PhotoInsightRange): readonly unknown[] =>
    driveKey('photo-busiest-days', DRIVE_EVERYWHERE, range),
  railCounts: (): readonly unknown[] => driveKey('photo-rail-counts', DRIVE_EVERYWHERE),
  stacks: (): readonly unknown[] => driveKey('photo-stacks', DRIVE_EVERYWHERE),
  stack: (stackId: string | null): readonly unknown[] =>
    driveKey('photo-stack', DRIVE_EVERYWHERE, stackId),
  sources: (source: PhotoSource): readonly unknown[] =>
    driveKey('photo-sources', DRIVE_EVERYWHERE, source),
  source: (source: PhotoSource, chipId: string | null, search: SourceSearch): readonly unknown[] =>
    driveKey('photo-sources', DRIVE_EVERYWHERE, source, chipId, search),
  backup: (): readonly unknown[] => driveKey('photo-backup', DRIVE_EVERYWHERE),
  duplicates: (): readonly unknown[] => driveKey('photo-duplicates', DRIVE_EVERYWHERE),
  duplicateStats: (): readonly unknown[] => driveKey('photo-duplicate-stats', DRIVE_EVERYWHERE),
  edit: (itemId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'edit'),
  editBase: (itemId: string, rev: number): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'edit-base', rev),
  editPatch: (itemId: string, patchId: string): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'edit-patch', patchId),
  editJob: (itemId: string, jobId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'edit-job', jobId),
  archiveBuckets: (scope: LibraryScope): readonly unknown[] =>
    driveKey('photo-archive-buckets', DRIVE_EVERYWHERE, scope),
  archiveMonth: (month: string, scope: LibraryScope): readonly unknown[] =>
    driveKey('photo-archive-month', DRIVE_EVERYWHERE, month, scope),
  lockedState: (): readonly unknown[] => driveKey('photo-locked-state', DRIVE_EVERYWHERE),
  locked: (): readonly unknown[] => driveKey('photo-locked', DRIVE_EVERYWHERE),
  lockedBuckets: (token: string): readonly unknown[] =>
    driveKey('photo-locked', DRIVE_EVERYWHERE, token, 'buckets'),
  lockedMonth: (token: string, month: string): readonly unknown[] =>
    driveKey('photo-locked', DRIVE_EVERYWHERE, token, 'month', month),
  people: (kind: PhotoGroupKind | null): readonly unknown[] =>
    driveKey('photo-people', DRIVE_EVERYWHERE, 'list', kind),
  group: (groupId: string | null): readonly unknown[] =>
    driveKey('photo-people', DRIVE_EVERYWHERE, 'group', groupId),
  faces: (itemId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'faces'),
  archived: (itemId: string): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'archived'),
  analysis: (itemId: string | null): readonly unknown[] =>
    driveKey('photo-media', DRIVE_EVERYWHERE, itemId, 'analysis'),
  aiStatus: (): readonly unknown[] => driveKey('photo-ai-status', DRIVE_EVERYWHERE),
  aiModels: (): readonly unknown[] => driveKey('photo-ai-status', DRIVE_EVERYWHERE, 'models'),
  suggest: (q: string): readonly unknown[] => driveKey('photo-suggest', DRIVE_EVERYWHERE, q),
  sharing: (): readonly unknown[] => driveKey('photo-sharing', DRIVE_EVERYWHERE, 'overview'),
  albumActivity: (albumId: string | null): readonly unknown[] =>
    driveKey('photo-sharing', DRIVE_EVERYWHERE, 'activity', albumId),
};
