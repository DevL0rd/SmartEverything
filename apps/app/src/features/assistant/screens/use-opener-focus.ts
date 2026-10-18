import { useLayoutEffect } from 'react';
import { isNative } from '../../../design/platform';

export function useOpenerFocus(open: boolean): void {
  useLayoutEffect(() => {
    if (!open || isNative()) {
      return undefined;
    }
    const opener = document.activeElement;
    return (): void => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [open]);
}
