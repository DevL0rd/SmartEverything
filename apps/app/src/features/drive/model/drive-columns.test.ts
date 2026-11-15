import { describe, expect, it } from 'vitest';
import { NAME_MIN, ROW_CHROME, placeColumns, type DriveColumn } from './drive-columns';

type Key = 'drive' | 'in' | 'size';

const COLUMNS: readonly DriveColumn<Key>[] = [
  { key: 'drive', title: 'Drive', width: 144 },
  { key: 'in', title: 'In', width: 176, maxWidth: 280, optional: true },
  { key: 'size', title: 'Size', width: 80, end: true },
];

const widths = (rowWidth: number): readonly (readonly [Key, number])[] | null =>
  placeColumns(rowWidth, COLUMNS)?.map((column) => [column.key, column.width] as const) ?? null;

describe('placeColumns', () => {
  it('keeps the name its minimum width and drops the columns when they do not fit', () => {
    const fixed = 144 + 80 + 16;
    expect(widths(ROW_CHROME + NAME_MIN + fixed - 1)).toBeNull();
    expect(widths(ROW_CHROME + NAME_MIN + fixed)).toEqual([
      ['drive', 144],
      ['size', 80],
    ]);
  });

  it('adds the optional column once it fits and grows it up to its widest', () => {
    const all = 144 + 176 + 80 + 32;
    expect(widths(ROW_CHROME + NAME_MIN + all)).toEqual([
      ['drive', 144],
      ['in', 176],
      ['size', 80],
    ]);
    expect(widths(ROW_CHROME + NAME_MIN + all + 40)).toEqual([
      ['drive', 144],
      ['in', 216],
      ['size', 80],
    ]);
    expect(widths(2000)).toEqual([
      ['drive', 144],
      ['in', 280],
      ['size', 80],
    ]);
  });
});
