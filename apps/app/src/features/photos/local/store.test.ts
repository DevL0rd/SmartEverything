import { describe, expect, it } from 'vitest';
import { localIdOf, localTilesOf } from './store';
import { currentBackupEntries, localItemsForScope, localMatches } from './tiles';
import { mergeLocalTiles } from '../library/phone-merge';
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

describe('local library', () => {
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
      localItemsForScope(items, { filter: 'videos' }, [], new Set()).map((entry) => entry.id),
    ).toEqual(['video']);

    expect(localItemsForScope(items, { filter: 'favourites' }, [], new Set())).toEqual([]);
    expect(localItemsForScope(items, { filter: 'all', placeId: 1 }, [], new Set())).toEqual([]);
    expect(localItemsForScope(items, { filter: 'all', countryCode: 'PT' }, [], new Set())).toEqual(
      [],
    );
    expect(localItemsForScope(items, { filter: 'all', camera: 'Sony' }, [], new Set())).toEqual([]);
    expect(localItemsForScope(items, { filter: 'all', albumId: 'album' }, [], new Set())).toEqual(
      [],
    );
  });

  it('narrows local media by name and by capture day like the hub query does', () => {
    const day = (iso: string): number => new Date(`${iso}T12:00:00`).getTime();
    const items = [
      { ...item('IMG_beach', day('2026-07-04')) },
      { ...item('IMG_city', day('2026-07-20')) },
      { ...item('IMG_snow', day('2025-12-24')) },
    ];
    const pick = (scope: Parameters<typeof localItemsForScope>[1]): readonly string[] =>
      localItemsForScope(items, scope, [], new Set()).map((entry) => entry.id);
    expect(pick({ filter: 'all', text: 'BEACH' })).toEqual(['IMG_beach']);
    expect(pick({ filter: 'all', from: '2026-07-01', to: '2026-07-31' })).toEqual([
      'IMG_beach',
      'IMG_city',
    ]);
    expect(pick({ filter: 'all', from: '2026-07-10' })).toEqual(['IMG_city']);
    expect(pick({ filter: 'all', to: '2026-01-01' })).toEqual(['IMG_snow']);
    expect(pick({ filter: 'all', text: 'IMG', from: '2026-07-01', to: '2026-07-10' })).toEqual([
      'IMG_beach',
    ]);
  });

  it('matches the device tab search on name and day alone', () => {
    const photo = item('IMG_beach', new Date('2026-07-04T12:00:00').getTime());
    expect(localMatches(photo, { text: null, from: null, to: null })).toBe(true);
    expect(localMatches(photo, { text: 'beach', from: '2026-07-04', to: '2026-07-04' })).toBe(true);
    expect(localMatches(photo, { text: 'city', from: null, to: null })).toBe(false);
    expect(localMatches(photo, { text: null, from: '2026-07-05', to: null })).toBe(false);
  });

  it('keeps the screenshots filter limited to classified hub items', () => {
    const items = [item('unclassified-photo', 1), item('unclassified-video', 2, true)];
    const scope = { filter: 'screenshots' } as const;
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
    const scope = { filter: 'all' } as const;
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
    const scope = { filter: 'all' } as const;
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
