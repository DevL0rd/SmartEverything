import { describe, expect, it } from 'vitest';
import { monitorLayout } from './monitor-layout';

describe('monitor wall layout', () => {
  it('stacks contained live pictures to use the width of a phone in portrait', () => {
    expect(monitorLayout({ width: 412, height: 915 }, 4, true)).toEqual([
      { left: 0, top: 0, width: 412, height: 227.25 },
      { left: 0, top: 229.25, width: 412, height: 227.25 },
      { left: 0, top: 458.5, width: 412, height: 227.25 },
      { left: 0, top: 687.75, width: 412, height: 227.25 },
    ]);
  });

  it('uses two columns for four desktop feeds and one row for four superwide feeds', () => {
    expect(monitorLayout({ width: 1440, height: 900 }, 4, true).map((tile) => tile.top)).toEqual([
      0, 0, 451, 451,
    ]);
    expect(monitorLayout({ width: 5120, height: 1440 }, 4, true).map((tile) => tile.top)).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it('preserves the snapshot grid and fills an incomplete final row', () => {
    expect(monitorLayout({ width: 412, height: 915 }, 5, false).map((tile) => tile.width)).toEqual([
      136, 136, 136, 205, 205,
    ]);
  });

  it('fills the wall with a focused tile and returns no boxes before layout or without cameras', () => {
    const size = { width: 3440, height: 1440 };
    expect(monitorLayout(size, 1, true)).toEqual([{ ...size, left: 0, top: 0 }]);
    expect(monitorLayout(size, 0, true)).toEqual([]);
    expect(monitorLayout({ ...size, height: 0 }, 2, true)).toEqual([]);
  });
});
