import { describe, expect, it } from 'vitest';
import { sharesOf } from './ranked-share';

describe('sharesOf', () => {
  it('scales every value against the largest one', () => {
    expect(sharesOf([200, 100, 50])).toEqual([1, 0.5, 0.25]);
  });

  it('gives every row an empty bar when nothing was counted', () => {
    expect(sharesOf([0, 0])).toEqual([0, 0]);
  });

  it('returns nothing for no values', () => {
    expect(sharesOf([])).toEqual([]);
  });
});
