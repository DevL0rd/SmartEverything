import { describe, expect, it } from 'vitest';
import {
  headIndices,
  justifyDay,
  layoutGrid,
  MEDIA_ZOOM_STEPS,
  reuseGridRows,
  rowHeight,
  TILE_GAP,
  PACK_GAP,
  type GridGeometry,
  type TileRow,
} from './justify';
import { fixtureTiles } from './fixtures';
import { groupDays, type MediaTile } from './tiles';

function tile(id: string, aspect: number): MediaTile {
  return {
    id,
    rev: 1,
    aspect,
    takenAt: Date.UTC(2026, 10, 7, 12),
    offsetMin: 0,
    durationMs: null,
    flags: 0,
    local: false,
  };
}

const GEOMETRY: GridGeometry = { width: 400, target: 100, gap: TILE_GAP };

function rowWidth(row: TileRow): number {
  return (
    row.tiles.reduce((sum, placed) => sum + placed.width, 0) + TILE_GAP * (row.tiles.length - 1)
  );
}

describe('row height targets per zoom step', () => {
  it('follows the design heights on pointer screens and grows with every step', () => {
    expect(MEDIA_ZOOM_STEPS.map((step) => rowHeight(step, 'pointer'))).toEqual([64, 112, 168, 232]);
    const touch = MEDIA_ZOOM_STEPS.map((step) => rowHeight(step, 'touch'));
    expect(touch[2]).toBe(112);
    expect([...touch].sort((left, right) => left - right)).toEqual(touch);
  });
});

describe('justifying one day', () => {
  it('fills full rows edge to edge and keeps the last row at the target height', () => {
    const tiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => tile(id, 1.5));
    const lines = justifyDay(tiles, GEOMETRY);
    expect(lines.length).toBeGreaterThan(1);
    const rows = layoutGrid([{ key: '2026-11-07', tiles }], GEOMETRY).filter(
      (row): row is TileRow => row.kind === 'tiles',
    );
    for (const row of rows.slice(0, -1)) expect(rowWidth(row)).toBeCloseTo(400, 6);
    const last = rows.at(-1);
    expect(last?.height).toBe(100);
    expect(last === undefined ? Infinity : rowWidth(last)).toBeLessThan(400);
    expect(rows.flatMap((row) => row.tiles.map((placed) => placed.tile.id))).toEqual(
      tiles.map((item) => item.id),
    );
  });

  it('stretches a short last row to the full width while it stays near the target', () => {
    const tiles = [tile('a', 1.5), tile('b', 1.5)];
    const rows = layoutGrid([{ key: '2026-11-07', tiles }], GEOMETRY).filter(
      (row): row is TileRow => row.kind === 'tiles',
    );
    expect(rows).toHaveLength(1);
    const only = rows[0];
    expect(only === undefined ? 0 : rowWidth(only)).toBeCloseTo(400, 6);
    expect(only?.height).toBeLessThanOrEqual(150);
  });

  it('keeps a lone tall tile at the target height instead of blowing it up', () => {
    const rows = layoutGrid([{ key: '2026-11-07', tiles: [tile('a', 0.75)] }], GEOMETRY).filter(
      (row): row is TileRow => row.kind === 'tiles',
    );
    expect(rows[0]?.height).toBe(100);
  });

  it('breaks where the row height lands closest to the target', () => {
    const lines = justifyDay([tile('a', 2), tile('b', 1.9), tile('c', 1)], GEOMETRY);
    expect(lines[0]?.tiles.map((item) => item.id)).toEqual(['a', 'b']);
    expect(lines[0]?.height).toBeCloseTo((400 - TILE_GAP) / 3.9, 6);
  });

  it('gives a panorama a row of its own', () => {
    const lines = justifyDay([tile('pano', 6), tile('a', 1), tile('c', 1)], GEOMETRY);
    expect(lines.map((line) => line.tiles.map((item) => item.id))).toEqual([['pano'], ['a', 'c']]);
    expect(lines[0]?.height).toBeCloseTo(400 / 6, 6);
    expect(lines[1]?.height).toBe(100);
  });
});

describe('the grid rows', () => {
  it('lays nothing out before the width is known', () => {
    expect(layoutGrid(groupDays(fixtureTiles(10)), { ...GEOMETRY, width: 0 })).toEqual([]);
  });

  it('heads every day and marks the heads sticky', () => {
    const rows = layoutGrid(groupDays(fixtureTiles(30, 10)), GEOMETRY);
    const heads = headIndices(rows);
    expect(heads.map((index) => rows[index]?.key)).toEqual([
      '2026-11-07:head',
      '2026-11-06:head',
      '2026-11-05:head',
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('keeps earlier row keys and objects when a later page arrives', () => {
    const first = layoutGrid(groupDays(fixtureTiles(40, 10)), GEOMETRY);
    const more = layoutGrid(groupDays(fixtureTiles(80, 10)), GEOMETRY);
    const reused = reuseGridRows(first, more);
    const stableKeys = first.slice(0, -4).map((row) => row.key);
    expect(more.slice(0, stableKeys.length).map((row) => row.key)).toEqual(stableKeys);
    expect(reused.slice(0, stableKeys.length)).toEqual(first.slice(0, stableKeys.length));
    reused.slice(0, stableKeys.length).forEach((row, index) => {
      expect(row).toBe(first[index]);
    });
    expect(reuseGridRows(first, layoutGrid(groupDays(fixtureTiles(40, 10)), GEOMETRY))).toBe(first);
  });

  it('lays out the 100k fixture in one pass with every item placed once', () => {
    const tiles = fixtureTiles(100_000);
    const rows = layoutGrid(groupDays(tiles), { ...GEOMETRY, width: 1360, target: 168 });
    const placed = rows.flatMap((row) => (row.kind === 'tiles' ? row.tiles : []));
    expect(placed).toHaveLength(100_000);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

function dayTile(id: string, aspect: number, day: number): MediaTile {
  return { ...tile(id, aspect), takenAt: Date.UTC(2026, 10, 7 - day, 12) };
}

describe('packing short days', () => {
  const PACKED: GridGeometry = { ...GEOMETRY, width: 500, pack: true };

  it('shares one row between days that do not fill it, each keeping its own heading', () => {
    const days = groupDays([dayTile('a', 1, 0), dayTile('b', 1, 1), dayTile('c', 1.5, 2)]);
    const rows = layoutGrid(days, PACKED);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row?.kind !== 'tiles') throw new Error('expected one packed tile row');
    expect(row.days?.map((packed) => packed.day.key)).toEqual([
      '2026-11-07',
      '2026-11-06',
      '2026-11-05',
    ]);
    expect(row.days?.map((packed) => packed.tiles.map((placed) => placed.tile.id))).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ]);
    const used = (row.days ?? []).reduce((sum, packed) => sum + packed.width, 0);
    expect(used + PACK_GAP * 2).toBeLessThanOrEqual(PACKED.width);
    expect(headIndices(rows)).toEqual([]);
  });

  it('starts a new row when the next day does not fit and lays a full day out on its own', () => {
    const full = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((id) => dayTile(id, 1, 3));
    const days = groupDays([
      dayTile('a', 1.5, 0),
      dayTile('b', 1.5, 1),
      dayTile('c', 2.5, 2),
      ...full,
    ]);
    const rows = layoutGrid(days, PACKED);
    expect(rows.slice(0, 4).map((row) => row.key)).toEqual([
      '2026-11-07:pack',
      '2026-11-05:head',
      '2026-11-05:c',
      '2026-11-04:head',
    ]);
    expect(rows.slice(4).every((row) => row.kind === 'tiles' && row.days === undefined)).toBe(true);
  });

  it('keeps a lone short day in the plain layout with its sticky heading', () => {
    const rows = layoutGrid(groupDays([dayTile('a', 1, 0)]), PACKED);
    expect(rows.map((row) => row.kind)).toEqual(['head', 'tiles']);
  });

  it('keeps one day per row when packing is off', () => {
    const days = groupDays([dayTile('a', 1, 0), dayTile('b', 1, 1)]);
    expect(layoutGrid(days, GEOMETRY).map((row) => row.kind)).toEqual([
      'head',
      'tiles',
      'head',
      'tiles',
    ]);
  });
});
