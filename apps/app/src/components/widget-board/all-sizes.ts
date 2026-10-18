import type { FrameClass } from './frame-class';
import type { BoardClass, WidgetSize } from './types';

export type FaceLayout = 'tile' | 'split' | 'wide' | 'tall' | 'report';

export type RowLayout = Exclude<FaceLayout, 'report'>;

export function allSizes(
  ...allowed: readonly WidgetSize[]
): Readonly<Record<BoardClass, readonly WidgetSize[]>> {
  return { compact: allowed, medium: allowed, expanded: allowed };
}

export function isTile(cls: FrameClass): boolean {
  return cls === 's';
}

export function faceLayoutOf(cls: FrameClass): FaceLayout {
  if (isTile(cls)) {
    return 'tile';
  }
  switch (cls) {
    case 'w':
      return 'wide';
    case 'l':
      return 'tall';
    case 'xl':
      return 'report';
    case 's':
    case 'xs':
    case 'm':
      return 'split';
  }
}

export function rowLayoutOf(cls: FrameClass): RowLayout {
  const layout = faceLayoutOf(cls);
  return layout === 'report' ? 'tall' : layout;
}
