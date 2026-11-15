export const SCROLL_STEP = 320;

export function scrollStepOf(snapTo: number | undefined): number {
  if (snapTo === undefined || snapTo <= 0) return SCROLL_STEP;
  return Math.max(1, Math.floor(SCROLL_STEP / snapTo)) * snapTo;
}

export interface RevealRange {
  readonly x: number;
  readonly width: number;
}

const REVEAL_MARGIN = 24;

export function revealOffset(range: RevealRange, offset: number, viewport: number): number | null {
  if (range.x - REVEAL_MARGIN < offset) return Math.max(0, range.x - REVEAL_MARGIN);
  const end = range.x + range.width + REVEAL_MARGIN;
  if (end > offset + viewport) return end - viewport;
  return null;
}
