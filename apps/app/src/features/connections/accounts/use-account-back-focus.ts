import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { isNative } from '../../../design/platform';

export function useAccountBackFocus(): () => void {
  const opener = useRef<HTMLAnchorElement | null>(null);
  useFocusEffect(
    useCallback(() => {
      const link = opener.current;
      opener.current = null;
      if (link === null) return undefined;
      const frame = requestAnimationFrame(() => {
        if (link.isConnected && document.activeElement === document.body) {
          link.focus({ preventScroll: true });
        }
      });
      return (): void => {
        cancelAnimationFrame(frame);
      };
    }, []),
  );
  return useCallback(() => {
    if (isNative()) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLAnchorElement ? active : null;
  }, []);
}
