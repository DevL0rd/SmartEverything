import { useEffect, useRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, type TextInput, type View } from 'react-native';
import { isNative } from '../design/platform';

const FOCUSABLE = '[tabindex="0"], [role="slider"], [role="radio"], [role="button"]';

function focusTargetOf(element: HTMLElement, staticTarget: boolean): HTMLElement | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element;
  const selector = staticTarget ? `${FOCUSABLE}, [tabindex="-1"]` : FOCUSABLE;
  return element.matches(selector) ? element : element.querySelector<HTMLElement>(selector);
}

export type FocusTarget = View | TextInput;

export function focusView(node: FocusTarget | null, staticTarget = false): boolean {
  if (isNative()) {
    const handle = findNodeHandle(node);
    if (handle === null) return false;
    AccessibilityInfo.setAccessibilityFocus(handle);
    return true;
  }
  const element: unknown = node;
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const target = focusTargetOf(element, staticTarget);
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
