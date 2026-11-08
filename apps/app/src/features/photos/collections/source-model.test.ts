import type { SourceItem } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  keptLine,
  nounCount,
  pickedDetail,
  pickedTiles,
  sourceDayDetail,
  sourceDaysOf,
  sourceRowsOf,
  sourceTileLabel,
  sourceTileOf,
} from './source-model';

const CLIP: SourceItem = {
  itemId: '00000000-0000-4000-8000-000000000001',
  chipId: 'front-door',
  madeAt: '2026-11-07T08:00:00.000Z',
  kept: false,
  name: '2026-11-07 08.00.00 rec-1.mp4',
  mime: 'video/mp4',
  bytes: 4_000_000,
  durationMs: 32_000,
};

function itemAt(index: number, madeAt: string): SourceItem {
  return { ...CLIP, itemId: `00000000-0000-4000-8000-00000000000${String(index)}`, madeAt };
}

describe('camera and AI source tiles', () => {
  it('turns a source item into a tile with its kind, length and kept mark', () => {
    const tile = sourceTileOf(CLIP);
    expect(tile.video).toBe(true);
    expect(tile.durationMs).toBe(32_000);
    expect(tile.kept).toBe(false);
    expect(sourceTileLabel(tile)).toBe('Clip, 0:32');
    const kept = sourceTileOf({
      ...CLIP,
      mime: 'image/png',
      durationMs: null,
      kept: true,
    });
    expect(kept.video).toBe(false);
    expect(sourceTileLabel(kept)).toBe('Picture, Kept');
  });

  it('groups tiles by day in the order the hub sent them', () => {
    const tiles = [
      itemAt(1, '2026-11-07T12:00:00'),
      itemAt(2, '2026-11-07T09:00:00'),
      itemAt(3, '2026-11-05T09:00:00'),
    ].map(sourceTileOf);
    const days = sourceDaysOf(tiles);
    expect(days.map((day) => [day.day, day.tiles.length])).toEqual([
      ['2026-11-07', 2],
      ['2026-11-05', 1],
    ]);
  });

  it('lays out a head and rows of equal tiles at the source aspect', () => {
    const tiles = [1, 2, 3, 4, 5].map((index) =>
      sourceTileOf(itemAt(index, '2026-11-07T09:00:00')),
    );
    const rows = sourceRowsOf(sourceDaysOf(tiles), { width: 1000, target: 160, gap: 3 }, 16 / 9);
    expect(rows.map((row) => row.kind)).toEqual(['head', 'tiles', 'tiles']);
    const first = rows[1];
    expect(first?.kind === 'tiles' ? first.tiles.length : 0).toBe(3);
    expect(first?.kind === 'tiles' ? first.height * (16 / 9) : 0).toBeCloseTo(
      first?.kind === 'tiles' ? first.tileWidth : -1,
    );
    expect(sourceRowsOf(sourceDaysOf(tiles), { width: 0, target: 160, gap: 3 }, 1)).toEqual([]);
  });

  it('heads a camera day with its cameras, clips and snapshots', () => {
    const names = new Map([
      ['front-door', 'Doorbell'],
      ['drive', 'Driveway'],
    ]);
    const clip = sourceTileOf(CLIP);
    const still = sourceTileOf({ ...CLIP, chipId: 'drive', mime: 'image/jpeg', durationMs: null });
    expect(sourceDayDetail('cameras', [clip, clip], names)).toBe('Doorbell · 2 clips');
    expect(sourceDayDetail('cameras', [clip, still, still], names)).toBe(
      'Doorbell, Driveway · 1 clip, 2 snapshots',
    );
    expect(sourceDayDetail('cameras', [{ ...still, chipId: 'gone' }], names)).toBe('1 snapshot');
  });

  it('heads an AI day with its images, chats and how many are kept', () => {
    const image = sourceTileOf({ ...CLIP, chipId: 'chat-1', mime: 'image/png', durationMs: null });
    const other = { ...image, chipId: 'chat-2' };
    expect(sourceDayDetail('ai', [image], new Map())).toBe('1 image');
    expect(sourceDayDetail('ai', [image, other, { ...other, kept: true }], new Map())).toBe(
      '3 images · from 2 chats · 1 kept',
    );
  });

  it('counts clips and images in plain words', () => {
    expect(nounCount('cameras', 1)).toBe('1 clip');
    expect(nounCount('cameras', 1204)).toBe('1,204 clips');
    expect(nounCount('ai', 9)).toBe('9 images');
  });

  it('says where kept items went and when nothing new was kept', () => {
    expect(keptLine('cameras', 3)).toBe('3 clips kept in Drive, in Saved › Cameras');
    expect(keptLine('cameras', 0)).toBe('Already in Drive');
    expect(keptLine('ai', 1)).toBe('1 image kept in your library');
    expect(keptLine('ai', 0)).toBe('Already in your library');
  });

  it('picks the selected tiles in order', () => {
    const tiles = [1, 2, 3].map((index) => sourceTileOf(itemAt(index, '2026-11-07T09:00:00')));
    const second = tiles[1];
    expect(second).toBeDefined();
    expect(pickedTiles(tiles, new Set([second?.id ?? '']))).toEqual([second]);
  });

  it('sums clip length for picked camera clips and size otherwise', () => {
    const clip = sourceTileOf(CLIP);
    const long = sourceTileOf({ ...CLIP, durationMs: 50_000 });
    const still = sourceTileOf({ ...CLIP, mime: 'image/jpeg', durationMs: null });
    expect(pickedDetail('cameras', [clip, long])).toBe('1 min 22 s');
    expect(pickedDetail('cameras', [clip])).toBe('32 s');
    expect(pickedDetail('cameras', [still])).toMatch(/B$/);
    expect(pickedDetail('ai', [clip])).toMatch(/B$/);
    expect(pickedDetail('cameras', [])).toBeNull();
  });
});
