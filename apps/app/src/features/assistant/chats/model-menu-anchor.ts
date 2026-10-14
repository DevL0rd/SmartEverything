import { useEffect, useEffectEvent } from 'react';
import type { RefObject } from 'react';
import { Keyboard, Platform, type View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
export function focusModelTrigger(ref: RefObject<View | null>): void {
  if (Platform.OS !== 'web') return;
  const node = ref.current;
  if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
    const button = node.querySelector('[role="button"]');
    if (button instanceof HTMLElement) button.focus();
  }
}
export function useModelMenuAnchor(
  ref: RefObject<View | null>,
  anchor: Rect | null,
  show: (anchor: Rect) => void,
): void {
  const showIfOpen = useEffectEvent((next: Rect): void => {
    if (anchor !== null) show(next);
  });
  const refresh = useEffectEvent((): void => {
    if (anchor === null) return;
    measureAnchor(ref, showIfOpen);
  });
  useEffect(() => {
    if (anchor === null) return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', refresh);
    const hidden = Keyboard.addListener('keyboardDidHide', refresh);
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    viewport?.addEventListener('resize', refresh);
    return (): void => {
      shown.remove();
      hidden.remove();
      viewport?.removeEventListener('resize', refresh);
    };
  }, [anchor]);
}
