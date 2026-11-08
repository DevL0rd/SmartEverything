import type { KeyboardEvent } from 'react';
import type { AccessibilityRole } from 'react-native';
import { isNative } from '../design/platform';

export function spaceKeyProps(
  role: AccessibilityRole | undefined,
  disabled: boolean,
  press: (() => void) | undefined,
): { readonly onKeyDown?: (event: KeyboardEvent) => void } {
  if (
    isNative() ||
    (role !== 'checkbox' && role !== 'radio' && role !== 'switch' && role !== 'tab') ||
    disabled ||
    press === undefined
  ) {
    return {};
  }
  return {
    onKeyDown: (event): void => {
      if (event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) press();
    },
  };
}
