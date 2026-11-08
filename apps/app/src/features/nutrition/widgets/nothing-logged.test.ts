import { describe, expect, it } from 'vitest';
import { emptyLinesOf } from './nothing-logged';

describe('emptyLinesOf', () => {
  it('keeps one hint line when only the title and one line fit above the band', () => {
    expect(emptyLinesOf(39.33, 'touch')).toBe(1);
    expect(emptyLinesOf(39.33, 'pointer')).toBe(1);
  });

  it('lets the hint wrap when the body has room for more lines', () => {
    expect(emptyLinesOf(80, 'touch')).toBe(3);
  });

  it('never asks for fewer than one line', () => {
    expect(emptyLinesOf(10, 'touch')).toBe(1);
  });
});
