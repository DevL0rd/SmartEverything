import { describe, expect, it } from 'vitest';
import { areaWidthOf } from '../../design/size-class';
import { GUTTER, gutterOf } from '../../design/tokens';
import {
  asideDockedAt,
  barLeadOf,
  frameBodyWidthOf,
  frameLayoutMath,
  gridColumnsOf,
  sectionRailOf,
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
    } as const;
    const fold = {
      area: 784 - 80,
      gutter: gutterOf('medium', 'touch', 'comfortable'),
      railWidth: 'icon',
    } as const;
    const desktop = {
      area: 1440 - 264,
      gutter: gutterOf('large', 'pointer', 'comfortable'),
      railWidth: 'wide',
    } as const;
    expect([phone, fold, desktop].map(frameBodyWidthOf)).toEqual([380, 560, 852]);
    expect(gridColumnsOf(frameBodyWidthOf(phone))).toBe(1);
    expect(gridColumnsOf(frameBodyWidthOf(fold))).toBe(2);
    expect(gridColumnsOf(frameBodyWidthOf(desktop))).toBe(3);
  });

  it('uses the body width to switch columns when a density change makes them fit', () => {
    const fold = { area: 780 - 80, railWidth: 'icon' } as const;
    const comfortable = frameBodyWidthOf({
      ...fold,
      gutter: gutterOf('medium', 'touch', 'comfortable'),
    });
    const compact = frameBodyWidthOf({ ...fold, gutter: gutterOf('medium', 'touch', 'compact') });
    expect([comfortable, compact].map(gridColumnsOf)).toEqual([1, 2]);
    expect([comfortable, compact].map(twoFrameColumnsAt)).toEqual([false, false]);
  });

  it('gives the body the whole area beside the rail minus the gutters at every width', () => {
    expect(frameBodyWidthOf({ area: 1920, gutter: 40, railWidth: 'wide' })).toBe(1580);
    expect(frameBodyWidthOf({ area: 3440, gutter: 40, railWidth: 'wide' })).toBe(3100);
    expect(frameBodyWidthOf({ area: 3440, gutter: 40 })).toBe(3360);
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

  it('shows a compact rail under 600, an icon rail to 900, a mid rail to 1024 and a wide rail above', () => {
    expect([412, 599].map((area) => shellRailOf(area, 'sections'))).toEqual(['compact', 'compact']);
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
      'compact',
      'icon',
      'icon',
      'icon',
    ]);
  });

  it('keeps the section rail on phones in its compact form, and none without sections', () => {
    expect([412, 884, 1440].map((area) => sectionRailOf(true, area, 'sections'))).toEqual([
      'compact',
      'compact',
      'compact',
    ]);
    expect(sectionRailOf(true, 412, 'icon')).toBe('compact');
    expect(sectionRailOf(false, 884, 'sections')).toBe('icon');
    expect(sectionRailOf(true, 412, null)).toBeNull();
  });

  it('places the body column one gutter in on a phone', () => {
    const column = shellColumnOf({ ...AUDIT.phone, rail: null, aside: 0 });
    expect(column).toEqual({ left: 16, width: 380 });
  });

  it('puts the rail flush at the edge and subtracts it and two gutters on a touch tablet', () => {
    const base = { ...AUDIT.tablet, aside: 0 } as const;
    expect(shellColumnOf({ ...base, rail: 'icon' })).toEqual({ left: 120, width: 660 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 24, width: 756 });
  });

  it('puts the wide rail flush at the edge and subtracts it and two gutters on desktop', () => {
    const base = { ...AUDIT.desktop, aside: 0 } as const;
    expect(shellColumnOf({ ...base, rail: 'wide' })).toEqual({ left: 292, width: 852 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 32, width: 1112 });
  });

  it('gives the collapsed sidebar width back to the body column', () => {
    const base = { ...AUDIT.collapsed, aside: 0 } as const;
    expect(shellColumnOf({ ...base, rail: 'wide' })).toEqual({ left: 292, width: 1044 });
    expect(shellColumnOf({ ...base, rail: null })).toEqual({ left: 32, width: 1304 });
  });

  it('never caps the body column on an ultrawide window', () => {
    const wide = { area: areaWidthOf(2560, 'sidebar', false), gutter: GUTTER.xlarge } as const;
    expect(shellColumnOf({ ...wide, rail: null, aside: 0 })).toEqual({ left: 40, width: 2216 });
    expect(shellColumnOf({ ...wide, rail: 'wide', aside: 0 })).toEqual({
      left: 300,
      width: 1956,
    });
  });

  it('docks the aside from 1100 and takes its width from the body column', () => {
    expect([1099, 1100].map(asideDockedAt)).toEqual([false, true]);
    const base = { ...AUDIT.desktop, rail: 'wide' } as const;
    expect(shellColumnOf({ ...base, aside: 432 })).toEqual({ left: 292, width: 852 - 432 });
  });
});

describe('app bar title placement', () => {
  it('leads the bar so an inline title starts at the column edge', () => {
    expect(barLeadOf(24, false)).toBe(12);
    expect(barLeadOf(144, true)).toBe(80);
    expect(barLeadOf(16, true)).toBe(0);
    expect(barLeadOf(24, true)).toBe(0);
  });
});
