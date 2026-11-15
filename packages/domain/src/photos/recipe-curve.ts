import type { PhotoRecipe } from './edit-recipe';

export const CURVE_SIZE = 256;

const EXPOSURE_STOPS = 2;
const MIDTONE_RANGE = 0.15;
const EXTREME_RANGE = 0.06;
const SHADOW_SHARPNESS = 3;
const BLACK_SHARPNESS = 8;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function toneOf(light: PhotoRecipe['light'], input: number): number {
  const exposed = clamp(input * 2 ** ((light.exposure / 100) * EXPOSURE_STOPS));
  const dark = 1 - exposed;
  const lifted =
    exposed +
    MIDTONE_RANGE *
      ((light.shadows / 100) * dark ** SHADOW_SHARPNESS +
        (light.highlights / 100) * exposed ** SHADOW_SHARPNESS) +
    EXTREME_RANGE *
      ((light.blacks / 100) * dark ** BLACK_SHARPNESS +
        (light.whites / 100) * exposed ** BLACK_SHARPNESS);
  return clamp((clamp(lifted) - 0.5) * (1 + light.contrast / 100) + 0.5);
}

export function toneCurve(light: PhotoRecipe['light']): readonly number[] {
  return Array.from({ length: CURVE_SIZE }, (_, index) =>
    Math.round(toneOf(light, index / (CURVE_SIZE - 1)) * (CURVE_SIZE - 1)),
  );
}
