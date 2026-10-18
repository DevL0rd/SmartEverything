type FrameLayout = 'compact' | 'icon' | 'wide';

export type RailWidth = 'icon' | 'mid' | 'wide';

export interface FrameBreakpoints {
  readonly compactMax: number;
  readonly iconRailMax: number;
  readonly wideRailMin: number;
}

export interface FrameLayoutMath {
  readonly frameLayoutOf: (area: number) => FrameLayout;
  readonly railWidthOf: (area: number) => RailWidth;
  readonly bodyWidthOf: (area: number) => number;
  readonly twoColumnsAt: (area: number) => boolean;
}

const GUTTER = 16;
const RAIL_PX: Readonly<Record<RailWidth, number>> = { icon: 96, mid: 240, wide: 260 };
const TWO_COLUMNS_BODY = 640;
const THREE_COLUMNS_FROM = 820;
const TWO_COLUMNS_FROM = 560;

export function frameLayoutMath(breakpoints: FrameBreakpoints): FrameLayoutMath {
  const frameLayoutOf = (area: number): FrameLayout => {
    if (area < breakpoints.compactMax) return 'compact';
    return area < breakpoints.iconRailMax ? 'icon' : 'wide';
  };
  const railWidthOf = (area: number): RailWidth => {
    if (area < breakpoints.iconRailMax) return 'icon';
    return area >= breakpoints.wideRailMin ? 'wide' : 'mid';
  };
  const bodyWidthOf = (area: number): number => {
    if (frameLayoutOf(area) === 'compact') return area - 2 * GUTTER;
    return area - RAIL_PX[railWidthOf(area)] - 3 * GUTTER;
  };
  return {
    frameLayoutOf,
    railWidthOf,
    bodyWidthOf,
    twoColumnsAt: (area) => bodyWidthOf(area) >= TWO_COLUMNS_BODY,
  };
}

export function gridColumnsOf(bodyWidth: number): 1 | 2 | 3 {
  if (bodyWidth >= THREE_COLUMNS_FROM) return 3;
  return bodyWidth >= TWO_COLUMNS_FROM ? 2 : 1;
}
