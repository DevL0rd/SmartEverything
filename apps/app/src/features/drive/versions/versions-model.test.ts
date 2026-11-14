import { describe, expect, it } from 'vitest';
import {
  DRIVE_CONFLICT,
  DRIVE_ITEM,
  DRIVE_VERSION,
  type DriveConflict,
  type DriveItem,
  type DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { FOLDER_ID, ROOT_ID } from '../data/fixtures';
import {
  CONFLICT_FOOTER,
  CURRENT,
  RESTORE_FOOTER,
  SIZE_WINDOW_MS,
  byOf,
  downloadableOf,
  entriesOf,
  entryOf,
  initialPicks,
  openConflictOf,
  pickOf,
  restorePlanOf,
  seriesOfEntry,
  settlePicks,
  sizePoints,
  slotOf,
  totalOf,
  totalText,
  whenOf,
  whoSeriesOf,
  type Namers,
} from './versions-model';

const ME = 'e1b2c3d4-0000-4000-8000-000000000001';
const SAM = 'e1b2c3d4-0000-4000-8000-000000000002';
const LAPTOP = 'e1b2c3d4-0000-4000-8000-000000000003';
const ITEM_ID = 'e1b2c3d4-0000-4000-8000-000000000004';
const NOW = Date.parse('2026-11-07T15:00:00.000Z');
const TIME = { now: NOW, zone: 'UTC' };

const NAMERS: Namers = {
  byName: (id) => (id === ME ? 'Robin' : id === SAM ? 'Sam' : null),
  deviceName: (id) => (id === LAPTOP ? 'Laptop' : null),
};

function idOf(index: number): string {
  return `f1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function item(extra: object = {}): DriveItem {
  return DRIVE_ITEM.parse({
    id: ITEM_ID,
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: 'Home/Island sketch v4.jpg',
    name: 'Island sketch v4.jpg',
    modifiedAt: '2026-11-07T13:52:00.000Z',
    addedAt: '2026-10-03T10:00:00.000Z',
    openedAt: null,
    starred: false,
    shared: false,
    rev: 4,
    etag: 'etag',
    outside: false,
    addedByProfileId: ME,
    remoteId: null,
    remoteRev: null,
    kind: 'document',
    mime: 'text/markdown',
    bytes: 3_400_000,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'none' },
    ...extra,
  });
}

function version(rev: number, at: string, size: number, extra: object = {}): DriveVersion {
  return DRIVE_VERSION.parse({
    id: idOf(rev),
    itemId: ITEM_ID,
    rev,
    sha256: 'a'.repeat(64),
    bytes: size,
    at,
    purgeAt: '2027-11-07T10:00:00.000Z',
    actorProfileId: ME,
    via: 'app',
    deviceId: null,
    addedByProfileId: ME,
    ...extra,
  });
}

const HISTORY: readonly DriveVersion[] = [
  version(3, '2026-11-07T13:52:00.000Z', 3_100_000, {
    actorProfileId: SAM,
    via: 'sync',
    deviceId: LAPTOP,
  }),
  version(2, '2026-11-03T18:20:00.000Z', 3_000_000),
  version(1, '2026-11-02T09:04:00.000Z', 2_200_000, { actorProfileId: null, via: 'ai' }),
];

describe('entriesOf', () => {
  it('puts the current copy first and credits each copy to the write that made it', () => {
    const entries = entriesOf(item(), HISTORY);
    expect(entries.map((entry) => entry.key)).toEqual([CURRENT, idOf(3), idOf(2), idOf(1)]);
    expect(entries.map((entry) => [entry.authorId, entry.via, entry.deviceId])).toEqual([
      [SAM, 'sync', LAPTOP],
      [ME, 'app', null],
      [null, 'ai', null],
      [ME, null, null],
    ]);
    expect(entries.map((entry) => entry.madeAt)).toEqual([
      '2026-11-07T13:52:00.000Z',
      '2026-11-03T18:20:00.000Z',
      '2026-11-02T09:04:00.000Z',
      '2026-10-03T10:00:00.000Z',
    ]);
  });

  it('leaves the maker unknown when the write before it was not kept', () => {
    const entries = entriesOf(item({ rev: 6 }), [version(2, '2026-11-03T18:20:00.000Z', 1)]);
    expect(entries[0]).toMatchObject({
      authorId: null,
      via: null,
      madeAt: '2026-11-07T13:52:00.000Z',
    });
    expect(entries[1]).toMatchObject({ authorId: null, via: null, madeAt: null });
  });

  it('marks the current copy as changed outside SmartEverything when the item says so', () => {
    const [current] = entriesOf(item({ rev: 9, outside: true }), HISTORY);
    expect(current?.via).toBe('outside');
    expect(current === undefined ? '' : byOf(current, NAMERS)).toBe(
      'Changed outside SmartEverything',
    );
  });
});

describe('A and B picks', () => {
  const entries = entriesOf(item(), HISTORY);

  it('starts with the current copy as A and the newest kept copy as B', () => {
    expect(initialPicks(entries)).toEqual({ a: CURRENT, b: idOf(3) });
    expect(initialPicks(entries.slice(0, 1))).toEqual({ a: CURRENT, b: null });
  });

  it('picks another version as B, swaps when B is picked, and keeps A when A is picked', () => {
    const start = initialPicks(entries);
    expect(pickOf(start, idOf(1))).toEqual({ a: CURRENT, b: idOf(1) });
    expect(pickOf(start, idOf(3))).toEqual({ a: idOf(3), b: CURRENT });
    expect(pickOf(start, CURRENT)).toBe(start);
  });

  it('names the slot of each version', () => {
    const picks = { a: CURRENT, b: idOf(2) };
    expect(entries.map((entry) => slotOf(picks, entry.key))).toEqual(['a', null, 'b', null]);
  });

  it('settles picks that point at versions which are gone', () => {
    const kept = { a: idOf(2), b: idOf(1) };
    expect(settlePicks(kept, entries)).toBe(kept);
    expect(settlePicks({ a: idOf(9), b: idOf(1) }, entries)).toEqual({ a: CURRENT, b: idOf(1) });
    expect(settlePicks({ a: idOf(2), b: idOf(9) }, entries)).toEqual({ a: idOf(2), b: CURRENT });
    expect(settlePicks({ a: CURRENT, b: idOf(3) }, entries.slice(0, 1))).toEqual({
      a: CURRENT,
      b: null,
    });
  });

  it('finds the picked entry or none', () => {
    expect(entryOf(entries, idOf(2))?.bytes).toBe(3_000_000);
    expect(entryOf(entries, null)).toBeNull();
    expect(entryOf(entries, idOf(9))).toBeNull();
  });
});

describe('totals and size over a year', () => {
  const entries = entriesOf(item(), HISTORY);

  it('counts every version and adds their sizes in the file unit', () => {
    const total = totalOf(entries);
    expect(total).toEqual({ count: 4, bytes: 11_700_000 });
    expect(totalText(total)).toBe(`4 versions · ${bytes(11_700_000)}`);
    expect(totalText(totalOf(entries.slice(0, 1)))).toBe(`1 version · ${bytes(3_400_000)}`);
  });

  it('plots the size of each dated version within the last year, oldest first', () => {
    const recent = sizePoints(entries, NOW);
    expect(recent.map((point) => point.v)).toEqual([2_200_000, 3_000_000, 3_100_000, 3_400_000]);
    const points = sizePoints(
      entriesOf(item({ addedAt: '2025-10-01T00:00:00.000Z' }), HISTORY),
      NOW,
    );
    expect(points.map((point) => point.v)).toEqual([3_000_000, 3_100_000, 3_400_000]);
    expect(points.every((point) => point.t >= NOW - SIZE_WINDOW_MS)).toBe(true);
  });
});

describe('who, how and when', () => {
  const entries = entriesOf(item(), HISTORY);

  it('says who made each copy and where', () => {
    expect(entries.map((entry) => byOf(entry, NAMERS))).toEqual([
      'Sam on Laptop',
      'Robin in the app',
      'AI',
      'Robin',
    ]);
  });

  it('colours the via dot by how and the avatar by who', () => {
    const [current, mine, ai] = entries;
    if (current === undefined || mine === undefined || ai === undefined) throw new Error('entries');
    expect(seriesOfEntry(current, ME)).toBe('background');
    expect(whoSeriesOf(current, ME)).toBe('people');
    expect(seriesOfEntry(mine, ME)).toBe('you');
    expect(whoSeriesOf(ai, ME)).toBe('ai');
  });

  it('dates a copy whose maker is unknown by when it was kept', () => {
    const [, gap] = entriesOf(item({ rev: 6 }), [version(2, '2026-11-03T18:20:00.000Z', 1)]);
    if (gap === undefined) throw new Error('gap');
    expect(whenOf(gap, TIME)).toMatch(/^Until /);
    expect(sizePoints([gap], NOW)).toEqual([]);
  });
});

describe('restore', () => {
  const entries = entriesOf(item(), HISTORY);
  const conflict = (resolvedAt: string | null): DriveConflict =>
    DRIVE_CONFLICT.parse({
      id: idOf(70),
      rootId: ROOT_ID,
      itemId: ITEM_ID,
      conflictItemId: idOf(71),
      relPath: 'Home/a',
      conflictRelPath: 'Home/a (conflict)',
      hubRev: 4,
      baseRev: 3,
      deviceId: LAPTOP,
      profileId: SAM,
      at: '2026-11-07T14:00:00.000Z',
      resolvedAt,
      resolution: resolvedAt === null ? null : 'keep_both',
    });

  it('restores B as a new version, the primary action when no conflict is open', () => {
    expect(restorePlanOf(entryOf(entries, idOf(2)), false)).toEqual({
      versionId: idOf(2),
      primary: true,
      footer: RESTORE_FOOTER,
    });
  });

  it('demotes restore and says why while a conflict is open', () => {
    expect(restorePlanOf(entryOf(entries, idOf(2)), true)).toEqual({
      versionId: idOf(2),
      primary: false,
      footer: CONFLICT_FOOTER,
    });
  });

  it('has nothing to restore when B is the current copy', () => {
    const current = entryOf(entries, CURRENT);
    expect(restorePlanOf(current, false).versionId).toBeNull();
    expect(downloadableOf(current)).toBe(true);
    expect(downloadableOf(entryOf(entries, idOf(2)))).toBe(false);
  });

  it('finds only the open conflict of this item', () => {
    const open = conflict(null);
    expect(openConflictOf([conflict('2026-11-07T14:30:00.000Z'), open], ITEM_ID)).toBe(open);
    expect(openConflictOf([open], idOf(99))).toBeNull();
  });
});
