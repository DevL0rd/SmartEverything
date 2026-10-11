import { describe, expect, it } from 'vitest';
import { initialItemCount, itemLayoutOf } from './virtual-list-math';

function sections(count: number, rows: number): { key: string; data: readonly unknown[] }[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `room-${String(index)}`,
    data: Array.from({ length: rows }, () => ({})),
  }));
}

describe('fixed row layout', () => {
  it('mounts only the rows near the viewport, not the whole list', () => {
    const layouts = itemLayoutOf(sections(12, 6), { rowLength: 220, topLength: 160 }, new Map());
    const total = layouts.length;
    expect(total).toBe(12 * 8);
    const initial = initialItemCount(layouts, 915);
    expect(initial).toBeLessThan(total / 4);
    expect(initial).toBeGreaterThan(4);
  });

  it('places items by offset with the header estimate and the fixed row length', () => {
    const layouts = itemLayoutOf(sections(2, 2), { rowLength: 100, topLength: 50 }, new Map());
    expect(layouts[0]).toEqual({ length: 38, offset: 50, index: 0 });
    expect(layouts[1]).toEqual({ length: 100, offset: 88, index: 1 });
    expect(layouts[3]).toEqual({ length: 0, offset: 288, index: 3 });
  });

  it('prefers a reported header height over the estimate', () => {
    const layouts = itemLayoutOf(
      sections(1, 1),
      { rowLength: 100, topLength: 0 },
      new Map([['room-0', 60]]),
    );
    expect(layouts[0]?.length).toBe(60);
    expect(layouts[1]?.offset).toBe(60);
  });
});
