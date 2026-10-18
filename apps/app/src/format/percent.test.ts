import { describe, expect, it } from 'vitest';
import { percentOf } from './percent';

describe('percentOf', () => {
  it('writes a share as a percentage with two decimals', () => {
    expect(percentOf(0.5)).toBe('50%');
    expect(percentOf(1 / 3)).toBe('33.33%');
    expect(percentOf(0)).toBe('0%');
  });

  it('writes a non-finite share as zero instead of throwing', () => {
    expect(percentOf(Number.NaN)).toBe('0%');
    expect(percentOf(Number.POSITIVE_INFINITY)).toBe('0%');
  });
});
