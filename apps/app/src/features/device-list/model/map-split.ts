import type { ViewStyle } from 'react-native';
import { clampPinnedSize } from '../../home-map';

export const MAP_SHARE_STEP = 0.05;

export function shareAfterDrag(start: number, translation: number, height: number): number {
  if (height <= 0) return start;
  return clampPinnedSize(start + translation / height);
}

export function shareAfterStep(current: number, direction: 'increment' | 'decrement'): number {
  const sign = direction === 'increment' ? 1 : -1;
  return clampPinnedSize(current + sign * MAP_SHARE_STEP);
}

export function pinnedStageHeight(parentHeight: number, share: number, collapsed: boolean): number {
  return collapsed ? 0 : share * parentHeight;
}

export function pinnedStageStyle(
  parentHeight: number,
  share: number,
  collapsed: boolean,
): ViewStyle {
  return { height: pinnedStageHeight(parentHeight, share, collapsed) };
}
