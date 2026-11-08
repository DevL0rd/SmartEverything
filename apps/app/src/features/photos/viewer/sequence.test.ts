import { describe, expect, it } from 'vitest';
import { fixtureTiles } from '../../../components/media-grid/fixtures';
import {
  adjacentMonths,
  dayPositionOf,
  EMPTY_SEQUENCE,
  needsMore,
  sequenceOf,
  wallMonthOf,
  type MonthTiles,
} from './sequence';

const TILES = fixtureTiles(6, 3);

function month(name: string, from: number, to: number, complete = true): MonthTiles {
  return { month: name, tiles: TILES.slice(from, to), complete };
}

function idAt(index: number): string {
  const tile = TILES[index];
  if (tile === undefined) throw new RangeError('no fixture tile');
  return tile.id;
}

describe('viewer sequence', () => {
  it('names the month on the wall clock of the photo, not in UTC', () => {
    expect(wallMonthOf('2026-10-31T23:30:00.000Z', 60)).toBe('2026-11');
    expect(wallMonthOf('2026-11-01T00:30:00.000Z', -60)).toBe('2026-10');
  });

  it('finds the newer and older months around a month', () => {
    const buckets = [
      { month: '2026-11', count: 3 },
      { month: '2026-10', count: 2 },
      { month: '2026-08', count: 1 },
    ];
    expect(adjacentMonths(buckets, '2026-10')).toEqual({ newer: '2026-11', older: '2026-08' });
    expect(adjacentMonths(buckets, '2026-11')).toEqual({ newer: null, older: '2026-10' });
    expect(adjacentMonths(buckets, '2025-01')).toEqual({ newer: null, older: null });
    expect(adjacentMonths(buckets, null)).toEqual({ newer: null, older: null });
  });

  it('counts the position of a photo within its day', () => {
    expect(dayPositionOf(TILES, 4)).toEqual({ position: 2, total: 3 });
    expect(dayPositionOf(TILES, 0)).toEqual({ position: 1, total: 3 });
    expect(dayPositionOf(TILES, 9)).toBeNull();
  });

  it('steps inside a month', () => {
    const sequence = sequenceOf(idAt(2), month('2026-11', 0, 6), null, null);
    expect(sequence.previous?.id).toBe(idAt(1));
    expect(sequence.next?.id).toBe(idAt(3));
    expect(sequence.current?.id).toBe(idAt(2));
  });

  it('crosses into the neighbouring months only when they are fully known', () => {
    const current = month('2026-10', 2, 4);
    const newer = month('2026-11', 0, 2);
    const older = month('2026-09', 4, 6);
    expect(sequenceOf(idAt(2), current, newer, older).previous?.id).toBe(idAt(1));
    expect(sequenceOf(idAt(3), current, newer, older).next?.id).toBe(idAt(4));
    const partial = month('2026-11', 0, 2, false);
    expect(sequenceOf(idAt(2), current, partial, older).previous).toBeNull();
  });

  it('does not step past a month that still has pages to read', () => {
    const current = month('2026-10', 2, 4, false);
    const older = month('2026-09', 4, 6);
    expect(sequenceOf(idAt(3), current, null, older).next).toBeNull();
    expect(needsMore(current, idAt(3))).toBe(true);
    expect(needsMore(current, idAt(2))).toBe(false);
    expect(needsMore(current, idAt(5))).toBe(true);
    expect(needsMore(month('2026-10', 2, 4), idAt(5))).toBe(false);
  });

  it('is empty when the photo is not in the month', () => {
    expect(sequenceOf(idAt(5), month('2026-11', 0, 3), null, null)).toBe(EMPTY_SEQUENCE);
  });
});
