import { describe, expect, it } from 'vitest';
import { frameLayoutMath, gridColumnsOf } from './frame-layout';

const first = frameLayoutMath({ compactMax: 600, iconRailMax: 900, wideRailMin: 1024 });
const second = frameLayoutMath({ compactMax: 600, iconRailMax: 720, wideRailMin: 1024 });

describe('frame layout math', () => {
  it('keeps one column below the compact limit, an icon rail to the icon limit and a full rail beyond', () => {
    expect([390, 599].map(first.frameLayoutOf)).toEqual(['compact', 'compact']);
    expect([600, 899].map(first.frameLayoutOf)).toEqual(['icon', 'icon']);
    expect(first.frameLayoutOf(900)).toBe('wide');
    expect([840, 960, 1440].map(first.railWidthOf)).toEqual(['icon', 'mid', 'wide']);
  });

  it('moves the icon rail limit with the breakpoints it is given', () => {
    expect([719, 720, 1023, 1024].map(second.railWidthOf)).toEqual(['icon', 'mid', 'mid', 'wide']);
    expect(second.frameLayoutOf(840)).toBe('wide');
    expect(first.frameLayoutOf(840)).toBe('icon');
  });

  it('leaves the body the width the rail does not take', () => {
    expect(first.bodyWidthOf(390)).toBe(358);
    expect(first.bodyWidthOf(1440)).toBe(1440 - 260 - 48);
    expect(first.bodyWidthOf(800)).toBe(800 - 96 - 48);
    expect(second.bodyWidthOf(800)).toBe(800 - 240 - 48);
  });

  it('goes to two columns by the width the body has, not the width of the area', () => {
    expect([599, 700, 800, 1000, 1440].map(first.twoColumnsAt)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it('chooses grid columns from the body width', () => {
    expect([500, 560, 819, 820].map(gridColumnsOf)).toEqual([1, 2, 2, 3]);
  });
});
