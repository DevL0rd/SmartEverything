import type { HsvColor } from '@smarteverything/domain';
import { colourCss } from '../../components/colour-picker-model';
import { WHITE_MAX_KELVIN, WHITE_MIN_KELVIN } from '../../components/level-math';

const WHITE_STOPS: readonly HsvColor[] = [
  { hue: 28, saturation: 68, value: 100 },
  { hue: 45, saturation: 16, value: 100 },
  { hue: 215, saturation: 38, value: 100 },
];

function between(from: number, to: number, share: number): number {
  return Math.round(from + (to - from) * share);
}

export function whiteColour(kelvin: number): HsvColor {
  const span = (kelvin - WHITE_MIN_KELVIN) / (WHITE_MAX_KELVIN - WHITE_MIN_KELVIN);
  const position = Math.min(1, Math.max(0, span)) * (WHITE_STOPS.length - 1);
  const index = Math.min(WHITE_STOPS.length - 2, Math.floor(position));
  const low = WHITE_STOPS[index];
  const high = WHITE_STOPS[index + 1];
  if (low === undefined || high === undefined) return { hue: 45, saturation: 16, value: 100 };
  const share = position - index;
  return {
    hue: between(low.hue, high.hue, share),
    saturation: between(low.saturation, high.saturation, share),
    value: 100,
  };
}

const RESTING_KELVIN = 2700;

export const RESTING_COLOUR: string = colourCss(whiteColour(RESTING_KELVIN));
