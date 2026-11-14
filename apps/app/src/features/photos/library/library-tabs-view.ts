import type { LibraryBucket } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { itemCount } from '../../../components/media-grid/day-text';
import {
  tabCountOf,
  tabsOf,
  type LibraryTab,
  type LibraryTabId,
  type TabCountInput,
} from '../model/library-tabs';
import { monthYear } from '../model/media-text';

export interface SourcesShown {
  readonly showCameras: boolean;
  readonly showAi: boolean;
}

export interface TabChipView {
  readonly id: LibraryTabId;
  readonly label: string;
  readonly icon: IconName | undefined;
  readonly count: number | null;
}

function sourceShown(tab: LibraryTab, shown: SourcesShown): boolean {
  if (tab.kind !== 'source') return true;
  return tab.source === 'cameras' ? shown.showCameras : shown.showAi;
}

export function shownTabs(hasLocalSource: boolean, shown: SourcesShown): readonly LibraryTab[] {
  return tabsOf(hasLocalSource).filter((tab) => sourceShown(tab, shown));
}

export function activeTabOf(raw: unknown, tabs: readonly LibraryTab[]): LibraryTab {
  const fallback = tabs[0];
  if (fallback === undefined) throw new RangeError('the Library has no tabs');
  return tabs.find((tab) => tab.id === raw) ?? fallback;
}

export function tabChipsOf(
  tabs: readonly LibraryTab[],
  counts: TabCountInput,
): readonly TabChipView[] {
  return tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
    count: tabCountOf(tab.id, counts),
  }));
}

function monthText(month: string): string {
  return monthYear(`${month}-01`);
}

export function spanOf(buckets: readonly LibraryBucket[]): string | null {
  const newest = buckets[0];
  const oldest = buckets.at(-1);
  if (newest === undefined || oldest === undefined) return null;
  if (newest.month === oldest.month) return monthText(newest.month);
  return `${monthText(oldest.month)} to ${monthText(newest.month)}`;
}

export function resultLineOf(buckets: readonly LibraryBucket[]): string | null {
  const span = spanOf(buckets);
  if (span === null) return null;
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return `${itemCount(total)} · ${span}`;
}

export function loadedLineOf(total: number, complete: boolean): string {
  return complete ? itemCount(total) : `${itemCount(total)} so far`;
}

export interface TabEmpty {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

export type HubTabId = 'all' | 'favourites' | 'videos' | 'screenshots';

export function hubTabOf(id: LibraryTabId): HubTabId {
  switch (id) {
    case 'all':
    case 'favourites':
    case 'videos':
    case 'screenshots':
      return id;
    case 'device':
    case 'cameras':
    case 'ai':
      throw new RangeError(`${id} is not a hub Library tab`);
  }
}

export const TAB_EMPTY: Readonly<Record<HubTabId | 'device', TabEmpty>> = {
  all: {
    icon: 'image',
    title: 'No photos yet',
    body: 'Upload photos and videos or turn on backup, and they appear here newest first.',
  },
  favourites: {
    icon: 'star',
    title: 'No favourites yet',
    body: 'Tap the star on a photo or video and it shows up here. A star set in Drive counts too.',
  },
  videos: {
    icon: 'film',
    title: 'No videos yet',
    body: 'Videos you upload or back up from a phone or computer show up here, newest first.',
  },
  screenshots: {
    icon: 'smartphone',
    title: 'No screenshots yet',
    body: 'Screenshots from your phones and computers show up here once they are backed up or uploaded.',
  },
  device: {
    icon: 'smartphone',
    title: 'No photos on this device',
    body: 'Photos and videos you take or save on this device show up here, backed up or not.',
  },
};
