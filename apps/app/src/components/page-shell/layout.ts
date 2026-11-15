import { MASTER_WIDTH } from '../../design/size-class';
import { CONTAINER_WIDTH } from '../../design/tokens';

type FrameLayout = 'compact' | 'icon' | 'wide';

export type FrameWidth = keyof typeof CONTAINER_WIDTH;

export type RailWidth = 'icon' | 'mid' | 'wide' | 'master';

export type RailForm = 'sections' | 'master' | 'icon';

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
  master: MASTER_WIDTH,
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

export type ShellWidth = FrameWidth | 'full';

export const SHELL_BREAKPOINTS: FrameBreakpoints = {
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
};

export const ASIDE_DOCK_FROM = 1100;

export const ASIDE_WIDTH = 360;

export const SEARCH_WIDTH = { min: 280, max: 560 } as const;

export const PHONE_TAB_LIMIT = 5;

const SHELL_CAP: Readonly<Record<ShellWidth, number>> = {
  reading: CONTAINER_WIDTH.reading,
  detail: CONTAINER_WIDTH.detail,
  dashboard: CONTAINER_WIDTH.dashboard,
  full: Infinity,
};

const shellMath = frameLayoutMath(SHELL_BREAKPOINTS);

export function shellRailOf(area: number, form: RailForm | null): RailWidth | null {
  if (form === null || shellMath.frameLayoutOf(area) === 'compact') return null;
  if (form === 'icon') return 'icon';
  const width = shellMath.railWidthOf(area);
  return form === 'master' && width === 'wide' ? 'master' : width;
}

export function asideDockedAt(area: number): boolean {
  return area >= ASIDE_DOCK_FROM;
}

export interface ShellGeometry {
  readonly area: number;
  readonly gutter: number;
  readonly width: ShellWidth;
  readonly rail: RailWidth | null;
  readonly aside: boolean;
}

export interface ShellColumn {
  readonly left: number;
  readonly width: number;
}

export function shellColumnOf({ area, gutter, width, rail, aside }: ShellGeometry): ShellColumn {
  const railSpan = rail === null ? 0 : RAIL_PX[rail] + gutter;
  const asideSpan = aside ? ASIDE_WIDTH : 0;
  const available = area - railSpan - asideSpan - 2 * gutter;
  return { left: gutter + railSpan, width: Math.max(0, Math.min(available, SHELL_CAP[width])) };
}

const BAR_TITLE_INSET = 12;

const BACK_SPAN = 52;

export function barLeadOf(titleLeft: number, back: boolean): number {
  return Math.max(0, titleLeft - BAR_TITLE_INSET - (back ? BACK_SPAN : 0));
}

export function barTitleStacks(titleLeft: number, back: boolean): boolean {
  return back && titleLeft < BAR_TITLE_INSET + BACK_SPAN;
}
