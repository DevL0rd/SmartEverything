import { describe, expect, it } from 'vitest';
import { fixtureTiles } from './fixtures';
import { layoutGrid, type MediaGridRow } from './justify';
import { thumbnailWindow, type ThumbnailWindow } from './thumbnail-window';
import { groupTiles } from './tiles';

const rows = layoutGrid(groupTiles(fixtureTiles(200, 200), 'day'), {
  width: 600,
  target: 100,
  gap: 3,
});

function windowOf(first: number, last: number, direction: number): ThumbnailWindow {
  return {
    first,
    last,
    direction,
    firstKey: rows[first]?.key ?? '',
    lastKey: rows[last]?.key ?? '',
  };
}

function idsOf(source: readonly MediaGridRow[]): readonly string[] {
  return source.flatMap((row) =>
    row.kind === 'tiles' ? row.tiles.map(({ tile }) => tile.id) : [],
  );
}

describe('thumbnail lookahead', () => {
  it('warms tiles beyond the visible viewport without loading the whole library', () => {
    const ahead = thumbnailWindow(rows, windowOf(1, 3, 1));
    const visible = idsOf(rows.slice(1, 4));
    expect(ahead.length).toBeGreaterThan(0);
    expect(ahead.every((tile) => !visible.includes(tile.id))).toBe(true);
    expect(ahead[0]?.id).toBe(idsOf(rows.slice(4))[0]);
    expect(ahead.length).toBeLessThan(200);
    const selected = new Set(ahead.map((tile) => tile.id));
    const warmedRows = rows.filter(
      (row) => row.kind === 'tiles' && row.tiles.some(({ tile }) => selected.has(tile.id)),
    );
    const height = (source: readonly MediaGridRow[]): number =>
      source.reduce((sum, row) => sum + (row.kind === 'tiles' ? row.height + 3 : 0), 0);
    const last = warmedRows.at(-1);
    expect(height(warmedRows) - (last?.kind === 'tiles' ? last.height + 3 : 0)).toBeLessThan(
      height(rows.slice(1, 4)),
    );
  });

  it('looks above the viewport when scrolling back up', () => {
    const ahead = thumbnailWindow(rows, windowOf(8, 10, -1));
    expect(ahead[0]?.id).toBe(idsOf(rows.slice(7, 8))[0]);
    expect(ahead.every((tile) => idsOf(rows.slice(0, 8)).includes(tile.id))).toBe(true);
  });

  it('does no work before measurement or after the feed replaces visible rows', () => {
    expect(thumbnailWindow(rows, null)).toEqual([]);
    expect(thumbnailWindow(rows.slice(20), windowOf(1, 3, 1))).toEqual([]);
  });

  it('stops at the library edges and does not duplicate tiles', () => {
    expect(thumbnailWindow(rows, windowOf(rows.length - 1, rows.length - 1, 1))).toEqual([]);
    const ahead = thumbnailWindow(rows, windowOf(1, 3, 1));
    expect(new Set(ahead.map((tile) => tile.id)).size).toBe(ahead.length);
  });
});
