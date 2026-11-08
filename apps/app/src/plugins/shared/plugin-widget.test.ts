import { describe, expect, it } from 'vitest';

const { bandCount, fittingCount, shownRows } = await import('./plugin-widget');

describe('plugin widget fitting', () => {
  it('counts only whole rows that fit the measured room', () => {
    expect(fittingCount([20, 20, 20], 8, 47)).toBe(1);
    expect(fittingCount([20, 20, 20], 8, 48)).toBe(2);
    expect(fittingCount([20, 20, 20], 8, 76)).toBe(3);
    expect(fittingCount([], 8, 100)).toBe(0);
  });

  it('stops at the first row that does not fit instead of skipping to a shorter one', () => {
    expect(fittingCount([20, 60, 10], 8, 40)).toBe(1);
  });

  it('always keeps the first row so a lane never goes blank', () => {
    expect(shownRows([120, 20], 8, 80, null)).toBe(1);
    expect(shownRows([], 8, 80, null)).toBe(0);
  });

  it('reserves the more caption only when rows are left out', () => {
    expect(shownRows([20, 20, 20], 8, 76, { height: 16, beyond: 0 })).toBe(3);
    expect(shownRows([20, 20, 20, 20], 8, 76, { height: 16, beyond: 0 })).toBe(2);
    expect(shownRows([20, 20, 20], 8, 76, { height: 16, beyond: 4 })).toBe(2);
  });

  it('fits buttons into the band rows the room allows, keeping their order', () => {
    expect(bandCount([80, 80, 80], 8, 200, 1)).toBe(2);
    expect(bandCount([80, 80, 80], 8, 200, 2)).toBe(3);
    expect(bandCount([80, 120, 40], 8, 200, 1)).toBe(1);
    expect(bandCount([80, 80], 8, 200, 0)).toBe(0);
  });

  it('measures every button before trimming when widths are not known yet', () => {
    expect(bandCount([0, 0, 0, 0], 8, 200, 1)).toBe(4);
  });

  it('leaves out a button wider than the band instead of overflowing it', () => {
    expect(bandCount([240, 40], 8, 200, 2)).toBe(0);
  });
});
