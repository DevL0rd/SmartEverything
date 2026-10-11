import { describe, expect, it } from 'vitest';
import { fittingRows, GAP, withHeight } from './fit-math';

describe('fittingRows', () => {
  it('keeps every row when stretched rows overshoot the room by rounding', () => {
    const heights = new Map([
      [0, 100.4],
      [1, 100.4],
      [2, 100.4],
    ]);
    expect(fittingRows(heights, 3, 100.4 * 3 + 32 - 0.9)).toBe(3);
  });

  it('drops rows that really do not fit', () => {
    const heights = new Map([
      [0, 100],
      [1, 100],
      [2, 100],
    ]);
    expect(fittingRows(heights, 3, 250)).toBe(2);
  });
});

describe('withHeight', () => {
  it('keeps identity for sub-pixel changes', () => {
    const heights = new Map([[0, 100]]);
    expect(withHeight(heights, 0, 100.3, false)).toBe(heights);
  });

  it('ignores growth while stretched and accepts shrink', () => {
    const heights = new Map([[0, 100]]);
    expect(withHeight(heights, 0, 140, true)).toBe(heights);
    expect(withHeight(heights, 0, 80, true).get(0)).toBe(80);
  });
});

const DENSITY = 2.625;

function laidOut(stretch: boolean, shown: number, room: number): ReadonlyMap<number, number> {
  const natural = 100;
  const share = (room - GAP * (shown - 1)) / shown;
  const height = stretch ? Math.ceil(share * DENSITY) / DENSITY : natural;
  return new Map(Array.from({ length: shown }, (_, index) => [index, height] as const));
}

type Fits = (heights: ReadonlyMap<number, number>, count: number, room: number) => number;

function flips(fits: Fits): number {
  const rows = 3;
  const room = 118.4 * rows + GAP * (rows - 1);
  let heights: ReadonlyMap<number, number> = new Map();
  let last = -1;
  let changes = 0;
  for (let step = 0; step < 40; step += 1) {
    const shown = fits(heights, rows, room);
    changes += shown === last ? 0 : 1;
    last = shown;
    const stretch = shown === rows;
    const measured = laidOut(stretch, shown, room);
    heights = new Map([...heights, ...[...measured].filter(([index]) => index < shown)]);
  }
  return changes;
}

function legacyFits(heights: ReadonlyMap<number, number>, count: number, room: number): number {
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    const height = heights.get(index);
    if (height === undefined) {
      return count;
    }
    used += height + (index === 0 ? 0 : GAP);
    if (used > room) {
      return Math.max(1, index);
    }
  }
  return count;
}

describe('pixel rounding of stretched rows', () => {
  it('flapped without the slack', () => {
    expect(flips(legacyFits)).toBeGreaterThan(10);
  });

  it('settles with the slack', () => {
    expect(flips(fittingRows)).toBeLessThanOrEqual(1);
  });
});
