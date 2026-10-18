import { describe, expect, it } from 'vitest';
import { columnsFor, contentWidth } from './grid-columns';

const WINDOWS = [
  { window: 390, gutter: 16, touch: 1, pointer: 1 },
  { window: 700, gutter: 24, touch: 2, pointer: 1 },
  { window: 1000, gutter: 24, touch: 2, pointer: 2 },
  { window: 1700, gutter: 40, touch: 3, pointer: 3 },
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

  it('never measures wider than the dashboard container', () => {
    expect(contentWidth(2600, 40)).toBe(1440);
    expect(contentWidth(390, 16)).toBe(358);
  });
});
