import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { DriveConflict, DriveItem } from '@smarteverything/domain';
import { notifyFailure } from '../../../components/toast-store';
import { flattenPages, useDriveConflicts, useDriveItem, useDriveVersions } from '../data';
import { VERSION_NAMES, type CompareNames } from './diff-model';
import { driveVersionLink } from './version-link';
import type { ComparedPair } from './versions-sheet-parts';
import type { PinnedEntry, TimelineLook } from './version-timeline';
import {
  copyEntryOf,
  entriesOf,
  entryOf,
  initialPicks,
  openConflictOf,
  restorePlanOf,
  settlePicks,
  type VersionEntry,
  type VersionPicks,
} from './versions-model';

export interface VersionsVersus {
  readonly copy: DriveItem;
  readonly deviceId: string;
  readonly names: CompareNames;
}

export interface VersionsTarget {
  readonly versionsKept: boolean | null;
  readonly item: DriveItem;
  readonly picks?: VersionPicks;
  readonly versus?: VersionsVersus;
}

export interface VersionsSlots {
  readonly conflict?: (conflict: DriveConflict) => ReactNode;
}

export interface VersionsData {
  readonly item: DriveItem;
  readonly entries: readonly VersionEntry[];
  readonly settled: boolean;
  readonly pages: ReturnType<typeof useDriveVersions>;
  readonly conflict: DriveConflict | null;
}

export function useVersionsData(target: VersionsTarget): VersionsData {
  const live = useDriveItem(target.item.id, target.item.rootId).data;
  const item = live ?? target.item;
  const pages = useDriveVersions(item.id, item.rootId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage().catch(notifyFailure('Earlier versions could not be read.'));
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const conflicts = flattenPages(useDriveConflicts(item.rootId).data, (page) => page.items);
  const versions = flattenPages(pages.data, (page) => page.items);
  return {
    item,
    entries: entriesOf(item, versions),
    settled: pages.data !== undefined && !hasNextPage,
    pages,
    conflict: openConflictOf(conflicts, item.id),
  };
}

export function usePicks(
  initial: VersionPicks | undefined,
  entries: readonly VersionEntry[],
): readonly [VersionPicks, (next: VersionPicks | null) => void] {
  const [chosen, choose] = useState<VersionPicks | null>(initial ?? null);
  return [settlePicks(chosen ?? initialPicks(entries), entries), choose];
}

export interface PanelParts {
  readonly target: VersionsTarget;
  readonly data: VersionsData;
  readonly picks: VersionPicks;
  readonly versus: VersionsVersus | null;
  readonly pinned: PinnedEntry | null;
  readonly look: TimelineLook;
  readonly slots: VersionsSlots;
  readonly onPick: (key: string) => void;
  readonly reset: () => void;
}

export type BodyState = 'loading' | 'unloaded' | 'one' | 'many';

export function bodyStateOf(parts: PanelParts, live: boolean): BodyState {
  const { data, pinned } = parts;
  if (!data.settled) return !live || data.pages.isError ? 'unloaded' : 'loading';
  return data.entries.length + (pinned === null ? 0 : 1) < 2 ? 'one' : 'many';
}

export function pairOf(parts: PanelParts): ComparedPair | null {
  const { data, picks, versus, pinned } = parts;
  const a = entryOf(data.entries, picks.a);
  if (a === null) return null;
  const item = data.item;
  if (versus !== null && pinned !== null) {
    const b = pinned.entry;
    return {
      a,
      b,
      names: versus.names,
      link: (entry) => driveVersionLink(entry.key === b.key ? versus.copy : item, entry),
    };
  }
  const b = entryOf(data.entries, picks.b);
  if (b === null) return null;
  return { a, b, names: VERSION_NAMES, link: (entry) => driveVersionLink(item, entry) };
}

export function restorableOf(parts: PanelParts): VersionEntry | null {
  return parts.versus === null ? entryOf(parts.data.entries, parts.picks.b) : null;
}

export function footerOf(parts: PanelParts, b: VersionEntry): string {
  return restorePlanOf(b, parts.data.conflict !== null).footer;
}

export function timelinePicksOf(parts: PanelParts): VersionPicks {
  const { versus, pinned, picks } = parts;
  return versus === null || pinned === null ? picks : { a: picks.a, b: pinned.entry.key };
}

export function pinnedOf(versus: VersionsVersus | undefined): PinnedEntry | null {
  if (versus === undefined) return null;
  return { entry: copyEntryOf(versus.copy, versus.deviceId), badge: versus.names.b };
}
