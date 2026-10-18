export const SLIDER_MIN_TRACK = 96;
const SLIDER_INSET = 12;

export type SliderLabelMode = 'inline' | 'caption';

export function sliderLabelMode(
  rowWidth: number,
  labelShare: number,
  gap: number,
): SliderLabelMode {
  const room = rowWidth * (1 - labelShare) - gap - 2 * SLIDER_INSET;
  return room >= SLIDER_MIN_TRACK ? 'inline' : 'caption';
}
