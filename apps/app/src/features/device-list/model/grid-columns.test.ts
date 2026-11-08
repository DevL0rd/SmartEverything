import { describe, expect, it } from 'vitest';
import { columnsFor, contentWidth } from './grid-columns';

const WINDOWS = [
  { window: 390, gutter: 16, touch: 1, pointer: 1 },
  { window: 700, gutter: 24, touch: 2, pointer: 1 },
  { window: 1000, gutter: 24, touch: 2, pointer: 2 },
  { window: 1440, gutter: 40, touch: 3, pointer: 3 },
  { window: 1700, gutter: 40, touch: 4, pointer: 4 },
  { window: 3440, gutter: 40, touch: 7, pointer: 7 },
  { window: 5120, gutter: 40, touch: 10, pointer: 10 },
] as const;

describe('device grid columns', () => {
  it.each(WINDOWS)('picks the columns for a $window px window', (row) => {
    const content = contentWidth(row.window, row.gutter);
    expect(columnsFor(content, 12)).toBe(row.touch);
    expect(columnsFor(content, 16)).toBe(row.pointer);
  });

  it.each(WINDOWS)('keeps tiles between 320 and 520 px at $window px', (row) => {
    const content = contentWidth(row.window, row.gutter);
    const columns = columnsFor(content, 12);
    const tile = (content - (columns - 1) * 12) / columns;
    expect(tile).toBeGreaterThanOrEqual(row.window === 390 ? 358 : 320);
    expect(tile).toBeLessThanOrEqual(520);
  });

  it('measures the available width between the gutters', () => {
    expect(contentWidth(5120, 40)).toBe(5040);
    expect(contentWidth(390, 16)).toBe(358);
  });

  it('keeps one wide tile per row for the narrow content of a room page on a phone', () => {
    expect(columnsFor(326, 12)).toBe(1);
    expect(columnsFor(358, 12)).toBe(1);
    expect(columnsFor(680, 12)).toBe(2);
  });
});
