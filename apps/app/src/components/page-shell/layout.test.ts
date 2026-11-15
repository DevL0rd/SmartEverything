import { describe, expect, it } from 'vitest';
import { areaWidthOf } from '../../design/size-class';
import { GUTTER, gutterOf } from '../../design/tokens';
import {
  ASIDE_WIDTH,
  asideDockedAt,
  barLeadOf,
  barTitleStacks,
  frameBodyWidthOf,
  frameLayoutMath,
  gridColumnsOf,
  shellColumnOf,
  shellRailOf,
  twoFrameColumnsAt,
} from './layout';

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

const AUDIT = {
  phone: { area: areaWidthOf(412, 'bar', false), gutter: GUTTER.compact },
  tablet: { area: areaWidthOf(884, 'rail', false), gutter: GUTTER.expanded },
  desktop: { area: areaWidthOf(1440, 'sidebar', false), gutter: GUTTER.large },
  collapsed: { area: areaWidthOf(1440, 'sidebar', true), gutter: GUTTER.large },
} as const;

describe('page shell layout', () => {
  it('takes the area from the window minus the navigation at each audit size', () => {
    expect(Object.values(AUDIT).map((size) => size.area)).toEqual([412, 804, 1176, 1368]);
  });

  it('shows tabs under 600, an icon rail to 900, a mid rail to 1024 and a wide rail above', () => {
    expect([412, 599].map((area) => shellRailOf(area, 'sections'))).toEqual([null, null]);
    expect([600, 804, 899].map((area) => shellRailOf(area, 'sections'))).toEqual([
      'icon',
      'icon',
      'icon',
    ]);
    expect([900, 1023].map((area) => shellRailOf(area, 'sections'))).toEqual(['mid', 'mid']);
    expect([1024, 1176, 1368].map((area) => shellRailOf(area, 'sections'))).toEqual([
      'wide',
      'wide',
      'wide',
    ]);
    expect(shellRailOf(1176, null)).toBeNull();
  });

  it('keeps an icon rail at every width beside the body when the page asks for one', () => {
    expect([412, 804, 960, 1176].map((area) => shellRailOf(area, 'icon'))).toEqual([
      null,
      'icon',
      'icon',
      'icon',
    ]);
  });

  it('widens a master list rail to the master width where the wide rail would show', () => {
    expect([412, 804, 960, 1176].map((area) => shellRailOf(area, 'master'))).toEqual([
      null,
      'icon',
      'mid',
      'master',
    ]);
    const desktop = { ...AUDIT.desktop, aside: false, rail: 'master' } as const;
    expect(shellColumnOf({ ...desktop, width: 'reading' })).toEqual({ left: 484, width: 660 });
  });

  it('places the body column one gutter in on a phone', () => {
    const column = shellColumnOf({ ...AUDIT.phone, width: 'dashboard', rail: null, aside: false });
    expect(column).toEqual({ left: 16, width: 380 });
  });

  it('subtracts the rail and three gutters on a touch tablet', () => {
    const base = { ...AUDIT.tablet, width: 'dashboard', aside: false } as const;
    expect(shellColumnOf({ ...base, rail: 'icon' })).toEqual({ left: 144, width: 636 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 24, width: 756 });
  });

  it('subtracts the wide rail on desktop and caps reading pages at 720', () => {
    const base = { ...AUDIT.desktop, width: 'dashboard', aside: false } as const;
    expect(shellColumnOf({ ...base, rail: 'wide' })).toEqual({ left: 324, width: 820 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 32, width: 1112 });
    expect(shellColumnOf({ ...base, rail: null, width: 'reading' })).toEqual({
      left: 32,
      width: 720,
    });
  });

  it('gives the collapsed sidebar width back to the body column', () => {
    const base = { ...AUDIT.collapsed, width: 'dashboard', aside: false } as const;
    expect(shellColumnOf({ ...base, rail: 'wide' })).toEqual({ left: 324, width: 1012 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 32, width: 1304 });
  });

  it('caps dashboards at 1440 and leaves full pages uncapped', () => {
    const wide = { area: 2400, gutter: 40, rail: null, aside: false } as const;
    expect(shellColumnOf({ ...wide, width: 'dashboard' }).width).toBe(1440);
    expect(shellColumnOf({ ...wide, width: 'full' }).width).toBe(2320);
  });

  it('docks the aside from 1100 and takes its width from the body column', () => {
    expect([1099, 1100].map(asideDockedAt)).toEqual([false, true]);
    const base = { ...AUDIT.desktop, width: 'dashboard', rail: 'wide' } as const;
    expect(shellColumnOf({ ...base, aside: true })).toEqual({
      left: 324,
      width: 820 - ASIDE_WIDTH,
    });
  });
});

describe('app bar title placement', () => {
  it('stacks the title under the back button when the gutter cannot hold it', () => {
    expect(barTitleStacks(16, true)).toBe(true);
    expect(barTitleStacks(24, true)).toBe(true);
    expect(barTitleStacks(144, true)).toBe(false);
    expect(barTitleStacks(16, false)).toBe(false);
    expect(barTitleStacks(24, false)).toBe(false);
  });

  it('leads the bar so an inline title starts at the column edge', () => {
    expect(barLeadOf(24, false)).toBe(12);
    expect(barLeadOf(144, true)).toBe(80);
    expect(barLeadOf(16, true)).toBe(0);
  });
});
