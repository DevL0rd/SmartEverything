import type { RefObject } from 'react';
import { Platform, type View } from 'react-native';

export function focusModelTrigger(ref: RefObject<View | null>): void {
  if (Platform.OS !== 'web') return;
  const node = ref.current;
  if (typeof HTMLElement !== 'undefined' && node instanceof HTMLElement) {
    const button = node.querySelector('[role="button"]');
    if (button instanceof HTMLElement) button.focus();
  }
}
