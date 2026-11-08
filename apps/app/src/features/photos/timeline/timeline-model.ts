import type { PhotoTimelineFilter, TimelineBucket } from '@smarteverything/domain';
import { hasPhotoFlag } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { itemCount } from '../../../components/media-grid/day-text';
import { bytes, count } from '../../../format/number';

export interface TimelineChip {
  readonly filter: PhotoTimelineFilter;
  readonly label: string;
  readonly icon?: IconName;
}

export const TIMELINE_CHIPS: readonly TimelineChip[] = [
  { filter: 'all', label: 'All' },
  { filter: 'videos', label: 'Videos' },
  { filter: 'favourites', label: 'Favourites', icon: 'star' },
];

export const ZOOM_OPTIONS: readonly { readonly value: MediaZoomStep; readonly label: string }[] = [
  { value: 'years', label: 'Years' },
  { value: 'months', label: 'Months' },
  { value: 'days', label: 'Days' },
  { value: 'comfortable', label: 'Comfortable' },
];

export const SEARCH_HINT = "Search by place, date or what's in the photo";

export function libraryLine(
  buckets: readonly TimelineBucket[],
  size: number | undefined,
  thisYear: number,
): string | null {
  const oldest = buckets.at(-1);
  if (oldest === undefined) return null;
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const year = Number(oldest.month.slice(0, 4));
  const span = year >= thisYear ? 'this year' : `${String(year)} to today`;
  const parts = [itemCount(total), size === undefined ? null : bytes(size), span];
  return parts.filter((part): part is string => part !== null).join(' · ');
}

export function offlineBody(seenClock: string | null): string {
  const cached = seenClock === null ? 'any cached hub photos' : `hub photos cached at ${seenClock}`;
  return `Local photos and videos remain available alongside ${cached}. Uploads wait until the hub is back.`;
}

export interface MonthFeed {
  readonly tiles: readonly MediaTile[];
  readonly more: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
}

export type FeedStep = 'fetch' | 'next' | 'none';

export function endStep(
  shown: readonly string[],
  feeds: ReadonlyMap<string, MonthFeed>,
  months: number,
): FeedStep {
  const last = shown.at(-1);
  if (last === undefined) return 'none';
  const feed = feeds.get(last);
  if (feed === undefined || feed.loading || feed.failed) return 'none';
  if (feed.more) return 'fetch';
  return shown.length < months ? 'next' : 'none';
}

export function feedTiles(
  shown: readonly string[],
  feeds: ReadonlyMap<string, MonthFeed>,
): readonly MediaTile[] {
  return shown.flatMap((month) => feeds.get(month)?.tiles ?? []);
}

export type FeedState = 'loading' | 'empty' | 'error' | 'ready';

export interface FeedInput {
  readonly buckets: readonly TimelineBucket[] | undefined;
  readonly bucketsFailed: boolean;
  readonly first: MonthFeed | undefined;
}

export function feedState({ buckets, bucketsFailed, first }: FeedInput): FeedState {
  if (bucketsFailed) return 'error';
  if (buckets === undefined) return 'loading';
  if (buckets.length === 0) return 'empty';
  if (first === undefined) return 'loading';
  if (first.tiles.length > 0) return 'ready';
  if (first.failed) return 'error';
  return first.loading ? 'loading' : 'ready';
}

export function allFavourite(ids: ReadonlySet<string>, tiles: readonly MediaTile[]): boolean {
  const picked = tiles.filter((tile) => ids.has(tile.id));
  return picked.length > 0 && picked.every((tile) => hasPhotoFlag(tile.flags, 'favourite'));
}

export function pickedText(ids: ReadonlySet<string>, tiles: readonly MediaTile[]): string {
  const videos = tiles.filter(
    (tile) => ids.has(tile.id) && hasPhotoFlag(tile.flags, 'video'),
  ).length;
  const head = `${count(ids.size)} selected`;
  if (videos === 0) return head;
  return `${head} · ${videos === 1 ? '1 video' : `${count(videos)} videos`}`;
}

export function dayIds(tiles: readonly MediaTile[]): readonly string[] {
  return tiles.map((tile) => tile.id);
}
