import { describe, expect, it } from 'vitest';
import { percentOf } from './percent';

describe('percentOf', () => {
  it('writes a share as a percent of the bar', () => {
    expect(percentOf(0.25)).toBe('25%');
    expect(percentOf(0)).toBe('0%');
    expect(percentOf(1)).toBe('100%');
  });

  it('keeps fractional percents', () => {
    expect(percentOf(0.125)).toBe('12.5%');
  });

  it('writes a share that is not a number as no width', () => {
    expect(percentOf(Number.NaN)).toBe('0%');
  });
});
