import { useEffect, useRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import { isNative } from '../design/platform';

const FOCUSABLE = '[tabindex="0"], [role="slider"], [role="radio"], [role="button"]';

function focusNode(node: View | null): void {
  if (isNative()) {
    const handle = findNodeHandle(node);
    if (handle !== null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
    return;
  }
  const element: unknown = node;
  if (!(element instanceof HTMLElement)) {
    return;
  }
  (element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE))?.focus();
}

export function useFocusRequest(requested: boolean): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!requested) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      focusNode(ref.current);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [requested]);
  return ref;
}
