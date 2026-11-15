import { useEffect, useMemo, useState } from 'react';
import { useValue } from '../../../design/external-store';
import { background } from '@smarteverything/logging';
import type { LibraryScope } from '@smarteverything/domain';
import type { SourceSearch } from '../../../api/photos';
import { wallDayKey, type MediaTile } from '../../../components/media-grid/tiles';
import { PREFS, usePref } from '../../../store/prefs';
import { useBackupHandle } from '../backup/handle';
import type { BackupHandle } from '../backup/handle';
import type { LedgerEntry } from '../backup/model/ledger';
import { backupStatus } from '../backup/model/status';
import { useHiddenFolderKeys, useShowAllFolders } from '../folders/data';
import { localLibrary, localTilesOf } from './store';
import type { LocalMediaItem } from './types';
import { useLocalLibrary } from './use-local-library';

export function currentBackupEntries(
  items: readonly LocalMediaItem[],
  entries: readonly LedgerEntry[],
): readonly LedgerEntry[] {
  const revisions = new Map(items.map((item) => [item.id, item.modificationTime]));
  return entries.filter(
    (entry) => entry.uploadedAt !== null && revisions.get(entry.localId) === entry.modificationTime,
  );
}

export function localMatches(item: LocalMediaItem, search: SourceSearch): boolean {
  if (search.text !== null && !item.name.toLowerCase().includes(search.text.toLowerCase())) {
    return false;
  }
  if (search.from === null && search.to === null) return true;
  const day = wallDayKey(item.takenAt, null);
  return (search.from === null || day >= search.from) && (search.to === null || day <= search.to);
}

export function shownLocalItems(
  items: readonly LocalMediaItem[],
  scope: LibraryScope,
  hidden: ReadonlySet<string>,
  all: boolean,
): readonly LocalMediaItem[] {
  const { folder } = scope;
  if (folder !== undefined) return items.filter((item) => item.folder?.key === folder);
  if (all || hidden.size === 0) return items;
  return items.filter((item) => item.folder === null || !hidden.has(item.folder.key));
}

function searchOfScope(scope: LibraryScope): SourceSearch {
  return {
    text: scope.meaning ?? scope.text ?? null,
    from: scope.from ?? null,
    to: scope.to ?? null,
  };
}

const HUB_ONLY_FIELDS = ['placeId', 'countryCode', 'camera', 'albumId', 'photoText'] as const;

function noneOf(list: readonly unknown[] | undefined): boolean {
  return list === undefined || list.length === 0;
}

function mergesLocal(scope: LibraryScope): boolean {
  return (
    (scope.filter === 'all' || scope.filter === 'videos') &&
    HUB_ONLY_FIELDS.every((field) => scope[field] === undefined) &&
    noneOf(scope.groupIds) &&
    noneOf(scope.labels)
  );
}

export function localItemsForScope(
  items: readonly LocalMediaItem[],
  scope: LibraryScope,
  uploaded: readonly LedgerEntry[],
  loadedHubIds: ReadonlySet<string>,
): readonly LocalMediaItem[] {
  if (!mergesLocal(scope)) return [];
  const present = new Set(
    currentBackupEntries(items, uploaded)
      .filter((entry) => entry.itemId !== null && loadedHubIds.has(entry.itemId))
      .map((entry) => entry.localId),
  );
  const search = searchOfScope(scope);
  return items.filter(
    (item) =>
      !present.has(item.id) &&
      (scope.filter !== 'videos' || item.video) &&
      localMatches(item, search),
  );
}

interface Uploaded {
  readonly handle: BackupHandle | null;
  readonly entries: readonly LedgerEntry[];
}

export function useLocalBackupEntries(): readonly LedgerEntry[] {
  const handle = useBackupHandle();
  const library = useValue(localLibrary);
  const [uploaded, setUploaded] = useState<Uploaded>({ handle: null, entries: [] });
  useEffect(() => {
    let current = true;
    const refresh = (): void => {
      if (handle === null) return;
      background(
        handle.runner.ledgerOf().then((ledger) => {
          if (current) setUploaded({ handle, entries: ledger.uploaded() });
        }),
        'photos.local_library.ledger_failed',
      );
    };
    refresh();
    let previous = backupStatus.get();
    const off = backupStatus.subscribe(() => {
      const status = backupStatus.get();
      if (
        status.done !== previous.done ||
        status.lastBackupAt !== previous.lastBackupAt ||
        (status.phase === 'idle' && previous.phase !== 'idle')
      )
        refresh();
      previous = status;
    });
    return (): void => {
      current = false;
      off();
    };
  }, [handle]);
  return useMemo(
    () => (uploaded.handle === handle ? currentBackupEntries(library.items, uploaded.entries) : []),
    [uploaded, handle, library.items],
  );
}

export function useLocalTiles(
  scope: LibraryScope,
  hub: readonly MediaTile[],
): readonly MediaTile[] {
  const library = useLocalLibrary();
  const uploaded = useLocalBackupEntries();
  const pref = usePref(PREFS.photos);
  const hidden = useHiddenFolderKeys();
  const all = useShowAllFolders();
  const shown = pref.status !== 'ready' || pref.value.showNotBackedUp;
  const videos = pref.status !== 'ready' || pref.value.showVideos;
  return useMemo(() => {
    const items = localItemsForScope(
      shownLocalItems(library.items, scope, hidden, all),
      scope,
      uploaded,
      new Set(hub.map((tile) => tile.id)),
    );
    const backedUp = new Set(uploaded.map((entry) => entry.localId));
    const visible = items.filter(
      (item) => (videos || !item.video) && (shown || backedUp.has(item.id)),
    );
    return localTilesOf(visible, backedUp);
  }, [shown, videos, library.items, scope, uploaded, hub, hidden, all]);
}

const ALL_LOCAL: LibraryScope = { filter: 'all' };

export function useDeviceTiles(
  search: SourceSearch,
  scope: LibraryScope = ALL_LOCAL,
): readonly MediaTile[] {
  const library = useLocalLibrary();
  const uploaded = useLocalBackupEntries();
  const hidden = useHiddenFolderKeys();
  const all = useShowAllFolders();
  return useMemo(() => {
    const backedUp = new Set(uploaded.map((entry) => entry.localId));
    return localTilesOf(
      shownLocalItems(library.items, scope, hidden, all).filter((item) =>
        localMatches(item, search),
      ),
      backedUp,
    );
  }, [library.items, uploaded, search, scope, hidden, all]);
}
