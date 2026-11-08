import { DRIVE_FEED_PAGE, type DriveFeedPage } from '@smarteverything/domain';
import type { DriveFeedWindow } from '../store/repositories/drive-feed';
import type { Store } from '../store/store';

export type FeedStore = Pick<Store, 'driveFeed' | 'driveRoots'>;

function pageOf(indexId: string, window: DriveFeedWindow, after: number): DriveFeedPage {
  return DRIVE_FEED_PAGE.parse({
    indexId,
    rows: window.rows,
    cursor: window.rows.at(-1)?.seq ?? after,
  });
}

export function rootFeed(
  store: FeedStore,
  rootId: string,
  after: number,
  limit: number,
): DriveFeedPage {
  const root = store.driveRoots.byId(rootId);
  return pageOf(root.indexId, store.driveFeed.sinceInRoot(rootId, after, limit), after);
}

export interface ItemFeedTarget {
  readonly rootId: string;
  readonly itemId: string;
}

export function itemFeed(
  store: FeedStore,
  { rootId, itemId }: ItemFeedTarget,
  after: number,
  limit: number,
): DriveFeedPage {
  const root = store.driveRoots.byId(rootId);
  return pageOf(root.indexId, store.driveFeed.ofItem(itemId, after, limit), after);
}

export function staleCursor(store: FeedStore, rootId: string, indexId: string): boolean {
  return store.driveRoots.byId(rootId).indexId !== indexId;
}
