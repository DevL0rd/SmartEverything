import { describe, expect, it } from 'vitest';
import { accumulateTap } from './selection-mode';

describe('selection mode taps', () => {
  it('adds a newly tapped card to the existing selection', () => {
    expect(accumulateTap(['a'], ['b'])).toEqual(['a', 'b']);
    expect(accumulateTap(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('removes a card that is tapped while it is already part of the selection', () => {
    expect(accumulateTap(['a', 'b'], ['a'])).toEqual(['b']);
  });

  it('lets the first tap and any multi-card change stand as they are', () => {
    expect(accumulateTap([], ['a'])).toBeNull();
    expect(accumulateTap(['a'], ['b', 'c'])).toBeNull();
    expect(accumulateTap(['a'], [])).toBeNull();
  });
});
