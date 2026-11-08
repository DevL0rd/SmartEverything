import type {
  PhotoInsights,
  PhotoRailCounts,
  PhotoTimelineFilter,
  TimelineBucket,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { bytes, count } from '../../../format/number';

export type CollectionId = 'favourites' | 'videos' | 'screenshots';

export interface CollectionSpec {
  readonly filter: PhotoTimelineFilter;
  readonly search: string;
  readonly line: string | null;
  readonly one: string;
  readonly many: string;
  readonly emptyIcon: IconName;
  readonly emptyTitle: string;
  readonly emptyBody: string;
}

export const COLLECTIONS: Readonly<Record<CollectionId, CollectionSpec>> = {
  favourites: {
    filter: 'favourites',
    search: 'Search favourites',
    line: 'Favourite here and Star in Drive are the same mark.',
    one: 'item',
    many: 'items',
    emptyIcon: 'star',
    emptyTitle: 'No favourites yet',
    emptyBody:
      'Tap the star on a photo or video and it shows up here. A star set in Drive counts too.',
  },
  videos: {
    filter: 'videos',
    search: 'Search videos',
    line: null,
    one: 'video',
    many: 'videos',
    emptyIcon: 'film',
    emptyTitle: 'No videos yet',
    emptyBody:
      'Videos you upload, back up from a phone or keep in a library folder show up here, newest first.',
  },
  screenshots: {
    filter: 'screenshots',
    search: 'Search screenshots',
    line: null,
    one: 'screenshot',
    many: 'screenshots',
    emptyIcon: 'smartphone',
    emptyTitle: 'No screenshots yet',
    emptyBody:
      'Screenshots from your phones and computers show up here once they are backed up or uploaded.',
  },
};

export function yearAgoMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  return `${String(year - 1)}${today.slice(4, 7)}`;
}

export function olderThanAYear(buckets: readonly TimelineBucket[], today: string): number {
  const cutoff = yearAgoMonth(today);
  return buckets.reduce((sum, bucket) => (bucket.month < cutoff ? sum + bucket.count : sum), 0);
}

export function screenshotLineOf(
  insights: PhotoInsights | undefined,
  buckets: readonly TimelineBucket[],
  today: string,
): string | null {
  const total = insights?.kinds.find((kind) => kind.kind === 'screenshot');
  if (total === undefined || total.items === 0) return null;
  const older = olderThanAYear(buckets, today);
  const size = bytes(total.bytes);
  return older === 0 ? size : `${size} · ${count(older)} older than a year`;
}

export function collectionCountOf(
  id: CollectionId,
  counts: PhotoRailCounts | undefined,
): string | null {
  const total = counts?.[id];
  if (total === undefined || total === 0) return null;
  const spec = COLLECTIONS[id];
  return `${count(total)} ${total === 1 ? spec.one : spec.many}`;
}
