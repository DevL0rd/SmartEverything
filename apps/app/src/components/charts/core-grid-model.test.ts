import { describe, expect, it } from 'vitest';
import {
  HEAT_COLUMNS,
  barIndexAt,
  barLayout,
  coreSummary,
  groupsOf,
  heatIndexAt,
  heatLayout,
  levelOf,
  threadLine,
} from './core-grid-model';

describe('coreSummary', () => {
  it('says the thread count, the busiest and the average', () => {
    expect(coreSummary([10, 64, 10])).toBe('3 threads, busiest 64 percent, average 28 percent');
  });
});

describe('threadLine', () => {
  it('names the thread one-based with its load', () => {
    expect(threadLine(4, [0, 0, 0, 0, 40.4])).toBe('Thread 5 · 40 %');
    expect(threadLine(null, [1])).toBeNull();
    expect(threadLine(9, [1])).toBeNull();
  });
});

describe('barLayout', () => {
  it('draws every track and bar in one path each', () => {
    const layout = barLayout([0, 50, 100, 100], 100, 40);
    expect(layout.tracks.match(/M/g)).toHaveLength(4);
    expect(layout.bars.match(/M/g)).toHaveLength(4);
    expect(layout.slot).toBeCloseTo(25 + 0.5, 5);
  });

  it('maps a pointer position to its thread and stays inside the grid', () => {
    expect(barIndexAt(0, 10, 4)).toBe(0);
    expect(barIndexAt(25, 10, 4)).toBe(2);
    expect(barIndexAt(500, 10, 4)).toBe(3);
    expect(barIndexAt(-5, 10, 4)).toBe(0);
  });
});

describe('heatLayout', () => {
  it('puts sixteen threads on a row and groups paints into at most ten levels', () => {
    const values = Array.from({ length: 128 }, (_, index) => index % 101);
    const layout = heatLayout(values, 332);
    expect(layout.levels.length).toBeLessThanOrEqual(10);
    expect(layout.height).toBeCloseTo(8 * layout.cell + 7 * 2, 5);
  });

  it('ranks load into ten bands', () => {
    expect([
      levelOf(0),
      levelOf(9.9),
      levelOf(10),
      levelOf(99),
      levelOf(100),
      levelOf(140),
    ]).toEqual([0, 0, 1, 9, 9, 9]);
  });

  it('finds the thread under a point, and none outside the strip', () => {
    const cell = 10;
    expect(heatIndexAt({ x: 1, y: 1 }, cell, 40)).toBe(0);
    expect(heatIndexAt({ x: 13, y: 13 }, cell, 40)).toBe(HEAT_COLUMNS + 1);
    expect(heatIndexAt({ x: 1, y: 100 }, cell, 40)).toBeNull();
    expect(heatIndexAt({ x: -1, y: 1 }, cell, 40)).toBeNull();
  });
});

describe('groupsOf', () => {
  it('falls back to one group holding every thread', () => {
    expect(groupsOf(64, undefined)).toEqual([{ label: 'All threads', from: 0, to: 64 }]);
    const given = [{ label: 'P', from: 0, to: 8 }];
    expect(groupsOf(8, given)).toBe(given);
  });
});
