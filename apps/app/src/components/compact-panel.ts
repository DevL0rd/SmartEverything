import { WIDTH_BREAKPOINTS } from '../design/tokens';

export const CHROME_SURFACE = 'border-hairline border-outline-variant bg-chrome';
export const FLOATING_SHEET_SURFACE = 'overflow-hidden rounded-xl elevation-3';
export const SHEET_GRABBER = 'h-1 w-8 rounded-full bg-on-surface-faint';
export const COMPACT_PANEL_INSET = 'px-3';
export const COMPACT_ROW_FRAME = 'flex-row items-center gap-3';
export const COMPACT_ROW_HEIGHT = 'min-h-12';
export const COMPACT_DETAIL_ROW_HEIGHT = 'min-h-14';
export const COMPACT_ROW_ICON_SIZE = 20;

const FLOATING_SHEET_GUTTER = 12;
export const FLOATING_SHEET_GAP = 8;
const FLOATING_SHEET_MAX_WIDTH = WIDTH_BREAKPOINTS.expanded - 2 * FLOATING_SHEET_GUTTER;

interface SheetInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export function floatingSheetFrame(
  viewport: { readonly width: number; readonly height: number },
  insets: SheetInsets,
): {
  readonly left: number;
  readonly width: number;
  readonly bottom: number;
  readonly maxHeight: number;
} {
  const start = insets.left + FLOATING_SHEET_GUTTER;
  const right = insets.right + FLOATING_SHEET_GUTTER;
  const bottom = insets.bottom + FLOATING_SHEET_GAP;
  const available = Math.max(1, viewport.width - start - right);
  const width = Math.min(available, FLOATING_SHEET_MAX_WIDTH);
  return {
    left: start + (available - width) / 2,
    width,
    bottom,
    maxHeight: Math.max(1, viewport.height - insets.top - bottom - FLOATING_SHEET_GAP),
  };
}
