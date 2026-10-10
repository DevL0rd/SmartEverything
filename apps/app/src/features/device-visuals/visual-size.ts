import { atLeast, useSizeClass } from '../../design/size-class';
import type { VisualSize } from './types';

export type VisualPx = 48 | 96 | 128 | 168 | 220 | 280;

export const SIZE_CLASS: Readonly<Record<VisualPx, string>> = {
  48: 'size-12',
  96: 'size-24',
  128: 'size-32',
  168: 'size-42',
  220: 'size-55',
  280: 'size-70',
};

export function useVisualPx(size: VisualSize): VisualPx {
  const { width } = useSizeClass();
  if (size === 'tile') {
    return 48;
  }
  if (size === 'card') {
    return 96;
  }
  return atLeast(width, 'expanded') ? 280 : 220;
}
