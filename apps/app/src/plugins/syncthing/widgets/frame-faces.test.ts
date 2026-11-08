import { describe, expect, it } from 'vitest';
import { chipWidthOf, devicesLineFits, fitChips, fitRows, rowCapacity } from './frame-faces';

const chips = (...labels: readonly string[]): readonly { readonly label: string }[] =>
  labels.map((label) => ({ label }));

describe('fitChips', () => {
  it('shows every chip that fits and counts the rest', () => {
    const all = chips('Photos', 'Documents', 'Family', 'Music', 'Books', 'Code');
    const fit = fitChips(all, 320, 1);
    expect(fit.shown.length).toBeGreaterThan(0);
    expect(fit.shown.length + fit.more).toBe(all.length);
    expect(fit.more).toBeGreaterThan(0);
  });

  it('shows all chips when they fit, with no count', () => {
    const fit = fitChips(chips('Photos', 'Music'), 600, 1);
    expect(fit.shown).toHaveLength(2);
    expect(fit.more).toBe(0);
  });

  it('holds more chips on two lines', () => {
    const all = chips('Photos', 'Documents', 'Family', 'Music', 'Books', 'Code');
    expect(fitChips(all, 320, 2).shown.length).toBeGreaterThan(fitChips(all, 320, 1).shown.length);
  });

  it('always shows at least one chip, however narrow', () => {
    expect(fitChips(chips('A very long folder name indeed'), 10, 1).shown).toHaveLength(1);
  });

  it('caps a chip at its maximum width', () => {
    expect(chipWidthOf('x'.repeat(80))).toBe(150);
  });
});

describe('fitRows', () => {
  it('keeps all rows that fit', () => {
    expect(fitRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
  });

  it('trades the last slot for a more row', () => {
    expect(fitRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], more: 3 });
  });
});

describe('rowCapacity', () => {
  it('counts the rows left after the reserved space and shows at least one', () => {
    expect(rowCapacity(300, 76, 48)).toBe(4);
    expect(rowCapacity(40, 76, 48)).toBe(1);
  });
});

describe('devicesLineFits', () => {
  it('keeps the devices line on a Medium widget at touch and pointer heights', () => {
    expect(devicesLineFits(87, 'touch', false)).toBe(true);
    expect(devicesLineFits(75, 'pointer', false)).toBe(true);
  });

  it('gives the outage line the room when a stale Medium cannot hold both', () => {
    expect(devicesLineFits(87, 'touch', true)).toBe(false);
    expect(devicesLineFits(271, 'touch', true)).toBe(true);
  });
});
