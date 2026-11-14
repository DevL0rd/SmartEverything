export const SLIDE_STOPS_AT = 1;

export function slideProgressOf(translation: number, travel: number): number {
  'worklet';
  if (travel <= 0) return 0;
  return Math.min(Math.max(translation / travel, 0), 1);
}

export function slideStops(progress: number): boolean {
  'worklet';
  return progress >= SLIDE_STOPS_AT;
}
