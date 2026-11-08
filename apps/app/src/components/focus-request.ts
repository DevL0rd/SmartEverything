import { useEffect, useRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import { isNative } from '../design/platform';

const FOCUSABLE = '[tabindex="0"], [role="slider"], [role="radio"], [role="button"]';

export function focusView(node: View | null, staticTarget = false): boolean {
  if (isNative()) {
    const handle = findNodeHandle(node);
    if (handle === null) return false;
    AccessibilityInfo.setAccessibilityFocus(handle);
    return true;
  }
  const element: unknown = node;
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const selector = staticTarget ? `${FOCUSABLE}, [tabindex="-1"]` : FOCUSABLE;
  const target = element.matches(selector) ? element : element.querySelector<HTMLElement>(selector);
  if (target === null || target.matches(':disabled, [aria-disabled="true"]')) return false;
  target.focus();
  return document.activeElement === target;
}

export function useFocusRequest(requested: boolean): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!requested) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      focusView(ref.current);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [requested]);
  return ref;
}
