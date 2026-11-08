import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';
import { isNative } from './platform';

const FOCUSABLE = '[role="button"],button,input,textarea,select,a[href],[tabindex="0"]';

export function focusInto(view: View | null): void {
  if (view === null) return;
  if (isNative()) {
    const handle = findNodeHandle(view);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
    return;
  }
  const node: unknown = view;
  if (node instanceof HTMLElement) node.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}
