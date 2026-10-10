import { useEffect, useRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import { isNative } from '../../../../design/platform';

export function useFocusFirst(): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node: unknown = ref.current;
    if (isNative()) {
      const handle = findNodeHandle(ref.current);
      if (handle !== null) {
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
      return;
    }
    if (node instanceof HTMLElement) {
      node.querySelector<HTMLElement>('[role="button"]')?.focus();
    }
  }, []);
  return ref;
}
