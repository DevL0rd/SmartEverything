import { CONTAINER_WIDTH } from '../design/tokens';

type FrameLayout = 'compact' | 'icon' | 'wide';

export type FrameWidth = keyof typeof CONTAINER_WIDTH;

export type RailWidth = 'icon' | 'mid' | 'wide';

export interface FrameBreakpoints {
  readonly compactMax: number;
  readonly iconRailMax: number;
  readonly wideRailMin: number;
}

export interface FrameLayoutMath {
  readonly frameLayoutOf: (area: number) => FrameLayout;
  readonly railWidthOf: (area: number) => RailWidth;
}

export const RAIL_PX: Readonly<Record<RailWidth, number>> = { icon: 96, mid: 240, wide: 260 };
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
  return { frameLayoutOf, railWidthOf };
}

interface BodyGeometry {
  readonly area: number;
  readonly gutter: number;
  readonly width: FrameWidth;
  readonly scroll: boolean;
  readonly railWidth?: RailWidth;
}

export function frameBodyWidthOf({ area, gutter, width, scroll, railWidth }: BodyGeometry): number {
  const cap = width === 'dashboard' ? Infinity : CONTAINER_WIDTH[width];
  const available = railWidth === undefined ? area : area - RAIL_PX[railWidth] - gutter;
  return Math.max(
    0,
    scroll ? Math.min(available - 2 * gutter, cap) : Math.min(available, cap) - 2 * gutter,
  );
}

export function twoFrameColumnsAt(bodyWidth: number): boolean {
  return bodyWidth >= TWO_COLUMNS_BODY;
}

export function gridColumnsOf(bodyWidth: number): 1 | 2 | 3 {
  if (bodyWidth >= THREE_COLUMNS_FROM) return 3;
  return bodyWidth >= TWO_COLUMNS_FROM ? 2 : 1;
}
