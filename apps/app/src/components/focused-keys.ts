import { useEffect, useState } from 'react';
import { isNative } from '../design/platform';

export function useFocusedKeys(
  active: boolean,
  onKey: (key: string, shift: boolean) => boolean,
): { onFocus: () => void; onBlur: () => void } {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!active || !focused || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (onKey(event.key, event.shiftKey)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active, focused, onKey]);
  return {
    onFocus: (): void => {
      setFocused(true);
    },
    onBlur: (): void => {
      setFocused(false);
    },
  };
}
