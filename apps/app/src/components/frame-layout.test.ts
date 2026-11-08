import { describe, expect, it } from 'vitest';
import { gutterOf } from '../design/tokens';
import {
  frameBodyWidthOf,
  frameLayoutMath,
  gridColumnsOf,
  twoFrameColumnsAt,
} from './frame-layout';

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

  it('fits content inside the rendered gutters on a phone, Fold and desktop', () => {
    const phone = {
      area: 412,
      gutter: gutterOf('compact', 'touch', 'comfortable'),
      width: 'detail',
      scroll: true,
    } as const;
    const fold = {
      area: 784 - 80,
      gutter: gutterOf('medium', 'touch', 'comfortable'),
      width: 'dashboard',
      scroll: true,
      railWidth: 'icon',
    } as const;
    const desktop = {
      area: 1440 - 264,
      gutter: gutterOf('large', 'pointer', 'comfortable'),
      width: 'dashboard',
      scroll: true,
      railWidth: 'wide',
    } as const;
    expect([phone, fold, desktop].map(frameBodyWidthOf)).toEqual([380, 536, 820]);
    expect(gridColumnsOf(frameBodyWidthOf(fold))).toBe(1);
    expect(
      gridColumnsOf(frameBodyWidthOf({ ...fold, gutter: gutterOf('medium', 'touch', 'compact') })),
    ).toBe(1);
    expect(gridColumnsOf(frameBodyWidthOf(desktop))).toBe(3);
  });

  it('uses the body width to switch columns when a density change makes them fit', () => {
    const fold = { area: 804 - 80, width: 'dashboard', scroll: true, railWidth: 'icon' } as const;
    const comfortable = frameBodyWidthOf({
      ...fold,
      gutter: gutterOf('medium', 'touch', 'comfortable'),
    });
    const compact = frameBodyWidthOf({ ...fold, gutter: gutterOf('medium', 'touch', 'compact') });
    expect([comfortable, compact].map(gridColumnsOf)).toEqual([1, 2]);
    expect([comfortable, compact].map(twoFrameColumnsAt)).toEqual([false, false]);
  });

  it('keeps reading width and lets dashboard content use the full area beside the rail', () => {
    const wide = { area: 1920, gutter: 40, width: 'reading', railWidth: 'wide' } as const;
    expect(frameBodyWidthOf({ ...wide, scroll: true })).toBe(720);
    expect(frameBodyWidthOf({ ...wide, scroll: false })).toBe(640);
    expect(frameBodyWidthOf({ ...wide, width: 'dashboard', scroll: true })).toBe(1540);
    expect(frameBodyWidthOf({ ...wide, width: 'dashboard', scroll: false })).toBe(1540);
  });

  it('lets a detail leaf reach its intended measure at ultrawide widths', () => {
    const body = { area: 3440, gutter: 40, width: 'detail', railWidth: 'wide' } as const;
    expect(frameBodyWidthOf({ ...body, scroll: true })).toBe(1120);
    expect(frameBodyWidthOf({ ...body, scroll: false })).toBe(1040);
  });

  it('chooses grid columns from the body width', () => {
    expect([500, 560, 819, 820].map(gridColumnsOf)).toEqual([1, 2, 2, 3]);
  });
});
