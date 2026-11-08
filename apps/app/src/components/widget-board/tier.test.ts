import { describe, expect, it } from 'vitest';
import { cellOf, frameOf } from './board-geometry';
import { tierHeight, tierInnerHeight, tierRows } from './tier';

describe('size tiers', () => {
  it('gives M and W two rows and XL four', () => {
    expect([tierRows('M'), tierRows('W'), tierRows('XL')]).toStrictEqual([2, 2, 4]);
  });

  it('takes the outer heights from the board tokens', () => {
    expect(tierHeight('M', 'touch', 'comfortable')).toBe(172);
    expect(tierHeight('M', 'touch', 'compact')).toBe(168);
    expect(tierHeight('M', 'pointer', 'comfortable')).toBe(160);
    expect(tierHeight('M', 'pointer', 'compact')).toBe(156);
    expect(tierHeight('XL', 'touch', 'comfortable')).toBe(356);
    expect(tierHeight('XL', 'touch', 'compact')).toBe(344);
    expect(tierHeight('XL', 'pointer', 'comfortable')).toBe(336);
    expect(tierHeight('XL', 'pointer', 'compact')).toBe(324);
  });

  it('matches the frame a board cell gives the same size', () => {
    const cell = cellOf(1112, 12, 'pointer', 'comfortable');
    const frame = frameOf(cell, { col: 0, row: 0, cols: 12, rows: tierRows('XL') });
    expect(frame.height).toBe(tierHeight('XL', 'pointer', 'comfortable'));
  });

  it('removes the card padding for the inner height', () => {
    expect(tierInnerHeight('M', 'touch', 'comfortable')).toBe(140);
    expect(tierInnerHeight('M', 'pointer', 'comfortable')).toBe(120);
  });
});
