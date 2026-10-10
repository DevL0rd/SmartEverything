import { useEffect } from 'react';
import { isNative } from '../design/platform';

export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };
    document.addEventListener('keydown', listen, { capture: true });
    return (): void => {
      document.removeEventListener('keydown', listen, { capture: true });
    };
  }, [active, onEscape]);
}
