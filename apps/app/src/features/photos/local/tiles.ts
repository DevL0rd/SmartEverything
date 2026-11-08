import { useEffect, useMemo, useState } from 'react';
import { useValue } from '../../../design/external-store';
import { background } from '@smarteverything/logging';
import type { PhotoScope } from '../../../api/photos';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { PREFS, usePref } from '../../../store/prefs';
import { useBackupHandle } from '../backup/handle';
import type { BackupHandle } from '../backup/handle';
import type { LedgerEntry } from '../backup/model/ledger';
import { backupStatus } from '../backup/model/status';
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

export function localItemsForScope(
  items: readonly LocalMediaItem[],
  scope: PhotoScope,
  uploaded: readonly LedgerEntry[],
  loadedHubIds: ReadonlySet<string>,
): readonly LocalMediaItem[] {
  if (scope.placeId !== null || (scope.filter !== 'all' && scope.filter !== 'videos')) return [];
  const present = new Set(
    currentBackupEntries(items, uploaded)
      .filter((entry) => entry.itemId !== null && loadedHubIds.has(entry.itemId))
      .map((entry) => entry.localId),
  );
  return items.filter((item) => !present.has(item.id) && (scope.filter !== 'videos' || item.video));
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

export function useLocalTiles(scope: PhotoScope, hub: readonly MediaTile[]): readonly MediaTile[] {
  const library = useLocalLibrary();
  const uploaded = useLocalBackupEntries();
  const pref = usePref(PREFS.photos);
  const shown = pref.status !== 'ready' || pref.value.showNotBackedUp;
  const videos = pref.status !== 'ready' || pref.value.showVideos;
  return useMemo(() => {
    const items = localItemsForScope(
      library.items,
      scope,
      uploaded,
      new Set(hub.map((tile) => tile.id)),
    );
    const backedUp = new Set(uploaded.map((entry) => entry.localId));
    const visible = items.filter(
      (item) => (videos || !item.video) && (shown || backedUp.has(item.id)),
    );
    return localTilesOf(visible, backedUp);
  }, [shown, videos, library.items, scope, uploaded, hub]);
}
