import { atLeast, useSizeClass } from '../../design/size-class';
import type { VisualSize } from './types';

const VISUAL_SIZES = [280, 220, 168, 128, 96, 72, 48] as const;

export type VisualPx = (typeof VISUAL_SIZES)[number];

export const SIZE_CLASS: Readonly<Record<VisualPx, string>> = {
  48: 'size-12',
  72: 'size-18',
  96: 'size-24',
  128: 'size-32',
  168: 'size-42',
  220: 'size-55',
  280: 'size-70',
};

export const FIXED_PX: Readonly<Record<Exclude<VisualSize, 'hero'>, VisualPx>> = {
  tile: 48,
  card: 96,
};

export function fitVisualPx(
  available: number,
  maximum: VisualPx = VISUAL_SIZES[0],
): VisualPx | undefined {
  const limit = Math.min(available, maximum);
  return VISUAL_SIZES.find((size) => size <= limit);
}

export function useVisualPx(size: VisualSize): VisualPx {
  const { width } = useSizeClass();
  if (size !== 'hero') {
    return FIXED_PX[size];
  }
  return atLeast(width, 'expanded') ? 280 : 220;
}
