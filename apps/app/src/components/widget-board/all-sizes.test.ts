import { describe, expect, it } from 'vitest';
import type { FrameClass } from './frame-class';
import { allSizes, faceLayoutOf, isTile, rowLayoutOf } from './all-sizes';

describe('allSizes', () => {
  it('offers the same sizes on every board class', () => {
    expect(allSizes('M', 'W')).toStrictEqual({
      compact: ['M', 'W'],
      medium: ['M', 'W'],
      expanded: ['M', 'W'],
    });
  });

  it('offers nothing when no size is given', () => {
    expect(allSizes()).toStrictEqual({ compact: [], medium: [], expanded: [] });
  });
});

describe('isTile', () => {
  it('is a tile for the narrow class', () => {
    expect(isTile('s')).toBe(true);
  });

  it('is not a tile for the short class', () => {
    expect(isTile('xs')).toBe(false);
  });

  it('is never a tile for the wider classes', () => {
    expect(isTile('m')).toBe(false);
    expect(isTile('l')).toBe(false);
    expect(isTile('w')).toBe(false);
    expect(isTile('xl')).toBe(false);
  });
});

const CASES: readonly (readonly [FrameClass, string])[] = [
  ['s', 'tile'],
  ['xs', 'split'],
  ['m', 'split'],
  ['w', 'wide'],
  ['l', 'tall'],
  ['xl', 'report'],
];

describe('faceLayoutOf', () => {
  it.each(CASES)('maps frame class %s to %s', (cls, layout) => {
    expect(faceLayoutOf(cls)).toBe(layout);
  });
});

describe('rowLayoutOf', () => {
  it('folds the report face into the tall face', () => {
    expect(rowLayoutOf('xl')).toBe('tall');
    expect(rowLayoutOf('w')).toBe('wide');
    expect(rowLayoutOf('s')).toBe('tile');
  });
});
