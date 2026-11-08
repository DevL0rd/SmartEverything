import { describe, expect, it } from 'vitest';
import { localIdOf, localTilesOf } from './store';
import { currentBackupEntries, localItemsForScope } from './tiles';
import { mergeLocalTiles } from '../timeline/phone-merge';
import type { LocalMediaItem } from './types';
import type { LedgerEntry } from '../backup/model/ledger';

function item(id: string, takenAt: number, video = false): LocalMediaItem {
  return {
    id,
    name: id,
    takenAt,
    modificationTime: 1,
    width: 640,
    height: 480,
    durationMs: video ? 1200 : null,
    video,
  };
}

describe('local library timeline', () => {
  it('shows local media while the hub is empty or has not answered', () => {
    const local = localTilesOf([item('older', 1), item('newer', 10)]);
    expect(mergeLocalTiles([], local).map((tile) => tile.id)).toEqual([
      'local:newer',
      'local:older',
    ]);
    expect(local.map(localIdOf)).toEqual(['newer', 'older']);
    expect(localIdOf({ id: 'local:pretend', local: false })).toBeNull();
  });

  it('interleaves local media with all local media while hub pagination is incomplete', () => {
    const hub = localTilesOf([item('hub', 10)]).map((tile) => ({ ...tile, local: false }));
    const local = localTilesOf([item('older', 1), item('newer', 20)]);
    expect(mergeLocalTiles(hub, local).map((tile) => tile.id)).toEqual([
      'local:newer',
      'local:hub',
      'local:older',
    ]);
    expect(mergeLocalTiles(hub, local)).toHaveLength(3);
  });

  it('limits videos to videos and never invents local favourites or places', () => {
    const items = [item('photo', 1), item('video', 2, true)];
    expect(
      localItemsForScope(items, { filter: 'videos', placeId: null }, [], new Set()).map(
        (entry) => entry.id,
      ),
    ).toEqual(['video']);

    expect(
      localItemsForScope(items, { filter: 'favourites', placeId: null }, [], new Set()),
    ).toEqual([]);
    expect(localItemsForScope(items, { filter: 'all', placeId: 1 }, [], new Set())).toEqual([]);
  });

  it('keeps the screenshots filter limited to classified hub items', () => {
    const items = [item('unclassified-photo', 1), item('unclassified-video', 2, true)];
    const scope = { filter: 'screenshots', placeId: null } as const;
    const local = localTilesOf(localItemsForScope(items, scope, [], new Set()));
    const hub = localTilesOf([item('hub-screenshot', 3)]).map((tile) => ({
      ...tile,
      local: false,
    }));
    expect(local).toEqual([]);
    expect(mergeLocalTiles(hub, local)).toBe(hub);
  });

  it('suppresses only the canonical backed-up item already loaded from the hub', () => {
    const items = [item('photo', 1), item('legacy', 2)];
    const entry: LedgerEntry = {
      localId: 'photo',
      itemId: 'hub-photo',
      sha256: 'a'.repeat(64),
      bytes: 1,
      modificationTime: 1,
      uploadedAt: '2026-11-08T00:00:00Z',
    };
    const legacy = { ...entry, localId: 'legacy', itemId: null };
    const scope = { filter: 'all', placeId: null } as const;
    expect(
      localItemsForScope(items, scope, [entry, legacy], new Set()).map((value) => value.id),
    ).toEqual(['photo', 'legacy']);
    expect(localItemsForScope(items, scope, [entry, legacy], new Set(['unrelated']))).toHaveLength(
      2,
    );
    expect(
      localItemsForScope(items, scope, [entry, legacy], new Set(['hub-photo'])).map(
        (value) => value.id,
      ),
    ).toEqual(['legacy']);
  });

  it('keeps an edited asset local until its current revision is backed up', () => {
    const original = item('same-id', 1);
    const edited = { ...original, modificationTime: 2000 };
    const entry: LedgerEntry = {
      localId: original.id,
      itemId: 'hub-original',
      sha256: 'a'.repeat(64),
      bytes: 1,
      modificationTime: original.modificationTime,
      uploadedAt: '2026-11-08T00:00:00Z',
    };
    const scope = { filter: 'all', placeId: null } as const;
    const loaded = new Set(['hub-original']);
    expect(localItemsForScope([original], scope, [entry], loaded)).toEqual([]);
    expect(localItemsForScope([edited], scope, [entry], loaded)).toEqual([edited]);
    expect(currentBackupEntries([edited], [entry])).toEqual([]);
    const backedUp = new Set(currentBackupEntries([edited], [entry]).map((value) => value.localId));
    const originalTile = localTilesOf([original])[0];
    const editedTile = localTilesOf([edited], backedUp)[0];
    expect(editedTile?.backedUp).toBe(false);
    expect(editedTile?.rev).toBe(2000);
    expect(editedTile?.rev).not.toBe(originalTile?.rev);
  });

  it('keeps unmeasured desktop media in the grid instead of omitting it', () => {
    const tiles = localTilesOf([{ ...item('unmeasured', 1), width: null, height: null }]);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.aspect).toBe(1);
  });
});
