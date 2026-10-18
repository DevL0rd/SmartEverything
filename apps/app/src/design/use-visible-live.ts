import type { RefObject } from 'react';
import type { View } from 'react-native';
import { useScreenLive } from './animation-gate';
import { useOnScreen } from './visibility';

export interface VisibleLive {
  readonly live: boolean;
  readonly onLayout: (() => void) | undefined;
}

export function isVisibleLive(visible: boolean, focused: boolean, foreground: boolean): boolean {
  return visible && focused && foreground;
}

export function useVisibleLive(ref: RefObject<View | null>): VisibleLive {
  const { visible, onLayout } = useOnScreen(ref);
  const { focused, foreground } = useScreenLive();
  return { live: isVisibleLive(visible, focused, foreground), onLayout };
}
