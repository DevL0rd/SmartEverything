import type { MeasuredDimensions } from 'react-native-reanimated';
import type { LiveRect } from './renderer-core';

export interface ModelScrollBounds {
  readonly top: number;
  readonly bottom: number;
  readonly viewport: number;
}

export function modelScrollBounds(
  box: MeasuredDimensions | null,
  viewport: MeasuredDimensions | null,
  offset: number,
  committedTop = 0,
): ModelScrollBounds | null {
  'worklet';
  if (box === null || viewport === null) return null;
  const top = box.pageY - viewport.pageY + offset - committedTop;
  return { top, bottom: top + box.height, viewport: viewport.height };
}

export function modelWithinViewport(
  bounds: ModelScrollBounds | null,
  offset: number,
  currentTop = 0,
): boolean {
  'worklet';
  return (
    bounds !== null &&
    bounds.bottom + currentTop > offset &&
    bounds.top + currentTop < offset + bounds.viewport
  );
}

export function localModelRect(
  box: MeasuredDimensions | null,
  parent: MeasuredDimensions | null,
): LiveRect | null {
  'worklet';
  if (box === null || parent === null) return null;
  return {
    x: box.pageX - parent.pageX,
    y: box.pageY - parent.pageY,
    width: box.width,
    height: box.height,
  };
}
