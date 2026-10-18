export const SCROLL_STEP = 320;

export function scrollStepOf(snapTo: number | undefined): number {
  if (snapTo === undefined || snapTo <= 0) return SCROLL_STEP;
  return Math.max(1, Math.floor(SCROLL_STEP / snapTo)) * snapTo;
}
