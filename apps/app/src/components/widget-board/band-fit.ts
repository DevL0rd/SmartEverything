import type { FrameClass } from './frame-class';

const TALL_CLASSES: ReadonlySet<FrameClass> = new Set(['l', 'xl']);

const BAND_GAP_PX = 8;

export interface BandFit {
  readonly width: number;
  readonly compactBelow: number | null;
}

export const BAND_FIT_START: BandFit = { width: 0, compactBelow: null };

export function oneRowBand(cls: FrameClass | null): boolean {
  return cls !== null && !TALL_CLASSES.has(cls);
}

export function isCompact(fit: BandFit): boolean {
  return fit.compactBelow !== null && fit.width < fit.compactBelow;
}

export function bandFitAfter(
  fit: BandFit,
  layout: { readonly width: number; readonly height: number; readonly row: number },
): BandFit {
  const wraps = layout.height > layout.row + BAND_GAP_PX;
  const next = { ...fit, width: layout.width };
  if (!isCompact(next) && wraps) {
    return { width: layout.width, compactBelow: layout.width + 1 };
  }
  return next.width === fit.width ? fit : next;
}
