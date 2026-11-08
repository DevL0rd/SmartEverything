import { describe, expect, it } from 'vitest';
import { BLOCKING_WIDGET_SIZES, stoppedLinesOf, topRowsOf } from './frame-faces';

describe('BLOCKING_WIDGET_SIZES', () => {
  it('keeps Wide off the phone board', () => {
    expect(BLOCKING_WIDGET_SIZES.compact).toEqual(['M', 'XL']);
    expect(BLOCKING_WIDGET_SIZES.medium).toContain('W');
    expect(BLOCKING_WIDGET_SIZES.expanded).toContain('W');
  });
});

describe('topRowsOf', () => {
  it('lists every top blocked row the measured height holds below its label', () => {
    expect(topRowsOf(19, 'touch')).toBe(0);
    expect(topRowsOf(48, 'touch')).toBe(1);
    expect(topRowsOf(20 + 5 * 28, 'touch')).toBe(5);
    expect(topRowsOf(20 + 9 * 28, 'touch')).toBe(9);
    expect(topRowsOf(18 + 2 * 28, 'pointer')).toBe(2);
  });
});

describe('stoppedLinesOf', () => {
  it('gives the paused headline one line and the detail the rest on a short Medium', () => {
    expect(stoppedLinesOf(39, 'touch')).toEqual({ headline: 1, detail: 1 });
    expect(stoppedLinesOf(39, 'pointer')).toEqual({ headline: 1, detail: 1 });
  });

  it('lets the headline wrap and the detail take every line left when the tier is tall', () => {
    expect(stoppedLinesOf(223, 'touch')).toEqual({ headline: 2, detail: 9 });
  });
});
