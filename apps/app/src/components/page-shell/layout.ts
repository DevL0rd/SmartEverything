export type FrameLayout = 'compact' | 'icon' | 'wide';

export type RailWidth = 'icon' | 'mid' | 'wide';

export type RailForm = 'sections' | 'icon';

export interface FrameBreakpoints {
  readonly compactMax: number;
  readonly iconRailMax: number;
  readonly wideRailMin: number;
}

export interface FrameLayoutMath {
  readonly frameLayoutOf: (area: number) => FrameLayout;
  readonly railWidthOf: (area: number) => RailWidth;
}

export const RAIL_PX: Readonly<Record<RailWidth, number>> = {
  icon: 96,
  mid: 240,
  wide: 260,
};
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
  readonly railWidth?: RailWidth;
}

export function frameBodyWidthOf({ area, gutter, railWidth }: BodyGeometry): number {
  const available = railWidth === undefined ? area : area - RAIL_PX[railWidth];
  return Math.max(0, available - 2 * gutter);
}

export function twoFrameColumnsAt(bodyWidth: number): boolean {
  return bodyWidth >= TWO_COLUMNS_BODY;
}

export function gridColumnsOf(bodyWidth: number): 1 | 2 | 3 {
  if (bodyWidth >= THREE_COLUMNS_FROM) return 3;
  return bodyWidth >= TWO_COLUMNS_FROM ? 2 : 1;
}

export const SHELL_BREAKPOINTS: FrameBreakpoints = {
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
};

export const ASIDE_DOCK_FROM = 1100;

export const SEARCH_WIDTH = { min: 280, max: 560 } as const;

export const PHONE_TAB_LIMIT = 5;

const shellMath = frameLayoutMath(SHELL_BREAKPOINTS);

export const shellLayoutOf = shellMath.frameLayoutOf;

export function shellRailOf(area: number, form: RailForm | null): RailWidth | null {
  if (form === null || shellMath.frameLayoutOf(area) === 'compact') return null;
  if (form === 'icon') return 'icon';
  return shellMath.railWidthOf(area);
}

export function asideDockedAt(area: number): boolean {
  return area >= ASIDE_DOCK_FROM;
}

export const ASIDE_MAIN_MIN = 640;

export type AsideFit = 'beside' | 'beside-icon-rail' | 'sheet';

function mainBesideOf(area: number, rail: RailWidth | null, aside: number): number {
  return area - (rail === null ? 0 : RAIL_PX[rail]) - aside;
}

export function asideFitOf(area: number, form: RailForm | null, aside: number): AsideFit {
  if (!asideDockedAt(area)) return 'sheet';
  if (mainBesideOf(area, shellRailOf(area, form), aside) >= ASIDE_MAIN_MIN) return 'beside';
  if (form === 'sections' && mainBesideOf(area, 'icon', aside) >= ASIDE_MAIN_MIN) {
    return 'beside-icon-rail';
  }
  return 'sheet';
}

export interface ShellGeometry {
  readonly area: number;
  readonly gutter: number;
  readonly rail: RailWidth | null;
  readonly aside: number;
}

export interface ShellColumn {
  readonly left: number;
  readonly width: number;
}

export function shellColumnOf({ area, gutter, rail, aside }: ShellGeometry): ShellColumn {
  const railSpan = rail === null ? 0 : RAIL_PX[rail];
  const available = area - railSpan - aside - 2 * gutter;
  return { left: gutter + railSpan, width: Math.max(0, available) };
}

const BAR_TITLE_INSET = 12;

const BACK_SPAN = 52;

export function barLeadOf(titleLeft: number, back: boolean): number {
  return Math.max(0, titleLeft - BAR_TITLE_INSET - (back ? BACK_SPAN : 0));
}
