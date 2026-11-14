import { describe, expect, it } from 'vitest';
import { DRIVE_ALBUM, DRIVE_ITEM, type DriveAlbum, type DriveItem } from '@smarteverything/domain';
import {
  NEW_MATCH_DAYS,
  matchDaysOf,
  smartCaptionOf,
  smartFoldersOf,
  smartStatsOf,
  thisWeekText,
  type SmartFolder,
} from './smart-model';

const ROOT = 'a1b2c3d4-0000-4000-8000-000000000001';

function item(index: number, addedAt: string, bytes: number): DriveItem {
  return DRIVE_ITEM.parse({
    id: `a1b2c3d4-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    rootId: ROOT,
    parentId: null,
    relPath: `File ${String(index)}.pdf`,
    name: `File ${String(index)}.pdf`,
    modifiedAt: addedAt,
    addedAt,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'application/pdf',
    bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    kind: 'document',
  });
}

function album(title: string, kind: 'smart' | 'manual', itemCount: number): DriveAlbum {
  return DRIVE_ALBUM.parse({
    id: `a1b2c3d4-0000-4000-8000-00000000020${String(title.length % 10)}`,
    title,
    surface: 'drive',
    scope: 'home',
    ownerProfileId: null,
    coverItemId: null,
    itemCount,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    kind,
    ...(kind === 'smart'
      ? { rule: { match: 'all', rules: [{ kind: 'starred', starred: true }] } }
      : {}),
  });
}

const TODAY = '2026-11-07';

describe('smart folder stats', () => {
  const items = [
    item(1, '2026-11-07T08:00:00.000Z', 2_000),
    item(2, '2026-11-07T09:00:00.000Z', 3_000),
    item(3, '2026-11-02T09:00:00.000Z', 5_000),
    item(4, '2026-10-25T09:00:00.000Z', 7_000),
    item(5, '2026-09-01T09:00:00.000Z', 11_000),
  ];

  it('counts new matches per day over the last fourteen days, oldest first', () => {
    const days = matchDaysOf({ items, complete: true, today: TODAY, timeZone: 'UTC' });
    expect(days).toHaveLength(NEW_MATCH_DAYS);
    expect(days[0]?.day).toBe('2026-10-25');
    expect(days[0]?.added).toBe(1);
    expect(days.at(-1)).toEqual({ day: TODAY, added: 2 });
    expect(days.reduce((sum, day) => sum + day.added, 0)).toBe(4);
  });

  it('adds up the size and this week only once every match is loaded', () => {
    const stats = smartStatsOf({ items, complete: true, today: TODAY, timeZone: 'UTC' });
    expect(stats.bytes).toBe(28_000);
    expect(stats.thisWeek).toBe(3);
    expect(thisWeekText(stats)).toBe('3 this week');
    const partial = smartStatsOf({ items, complete: false, today: TODAY, timeZone: 'UTC' });
    expect(partial).toEqual({ bytes: null, days: null, thisWeek: null });
    expect(thisWeekText(partial)).toBeNull();
  });

  it('says the live count and, when known, the size', () => {
    const [folder] = smartFoldersOf([album('Receipts', 'smart', 146)]);
    if (folder === undefined) throw new Error('no smart folder');
    expect(smartCaptionOf(folder, { bytes: null, days: null, thisWeek: null })).toBe('146 files');
    expect(smartCaptionOf(folder, { bytes: 1_024, days: [], thisWeek: 0 })).toMatch(
      /^146 files · /,
    );
  });

  it('lists only smart folders, by name', () => {
    const folders: readonly SmartFolder[] = smartFoldersOf([
      album('Zebra', 'smart', 1),
      album('Hand picked', 'manual', 2),
      album('Apples', 'smart', 3),
    ]);
    expect(folders.map((folder) => folder.title)).toEqual(['Apples', 'Zebra']);
  });
});
