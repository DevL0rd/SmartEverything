import { describe, expect, it } from 'vitest';
import { TIMELINE_PAGE, photoFlags } from '@smarteverything/domain';
import { localDayKey } from '../../format/time';
import { groupDays, groupTiles, sameTile, tilesOfPage, wallDayKey } from './tiles';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

const PAGE = TIMELINE_PAGE.parse({
  month: '2026-11',
  ids: [A, B, C],
  revs: [3, 1, 2],
  aspect: [1.5, 0.75, 1],
  takenAt: [Date.UTC(2026, 10, 7, 23, 30), Date.UTC(2026, 10, 7, 22), Date.UTC(2026, 10, 6, 9)],
  offsetMin: [60, -300, null],
  durationMs: [null, 42_000, null],
  thumbhash: ['3OcRJYB4d3h/iIeHeEh3eIhw+j3A', null, null],
  flags: [photoFlags(['live']), photoFlags(['video', 'favourite']), 0],
  next: null,
});

describe('tiles from a columnar timeline page', () => {
  it('reads one tile per id with every column at its index', () => {
    const tiles = tilesOfPage(PAGE);
    expect(tiles.map((tile) => [tile.id, tile.rev, tile.aspect, tile.durationMs])).toEqual([
      [A, 3, 1.5, null],
      [B, 1, 0.75, 42_000],
      [C, 2, 1, null],
    ]);
    expect(tiles[0]?.thumbhash).toBe('3OcRJYB4d3h/iIeHeEh3eIhw+j3A');
    expect(tiles.every((tile) => !tile.local)).toBe(true);
  });

  it('files each item under the wall-clock day where it was taken', () => {
    expect(wallDayKey(Date.UTC(2026, 10, 7, 23, 30), 60)).toBe('2026-11-08');
    expect(wallDayKey(Date.UTC(2026, 10, 7, 2), -300)).toBe('2026-11-06');
    const takenAt = Date.UTC(2026, 10, 6, 9);
    expect(wallDayKey(takenAt, null)).toBe(localDayKey(takenAt));
  });

  it('groups consecutive items of a day together, newest first as given', () => {
    const days = groupDays(tilesOfPage(PAGE));
    expect(days.map((day) => [day.key, day.tiles.map((tile) => tile.id)])).toEqual([
      ['2026-11-08', [A]],
      ['2026-11-07', [B]],
      [localDayKey(Date.UTC(2026, 10, 6, 9)), [C]],
    ]);
  });

  it('groups by wall-clock month when asked, and by day otherwise', () => {
    const tiles = tilesOfPage(PAGE);
    const months = groupTiles(tiles, 'month');
    expect(months.map((month) => [month.key, month.tiles.length])).toEqual([['2026-11', 3]]);
    expect(groupTiles(tiles, 'day')).toEqual(groupDays(tiles));
  });

  it('treats a new revision of the same item as a different tile', () => {
    const [first] = tilesOfPage(PAGE);
    if (first === undefined) throw new Error('the page has tiles');
    expect(sameTile(first, { ...first })).toBe(true);
    expect(sameTile(first, { ...first, rev: 4 })).toBe(false);
    expect(sameTile(first, { ...first, flags: 0 })).toBe(false);
  });
});
