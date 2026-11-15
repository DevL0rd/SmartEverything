import { useEffect, useEffectEvent } from 'react';
import { keyPressOf } from '../../../design/keyboard';
import { isNative } from '../../../design/platform';
import { quickLookKeyFor, type QuickLookKey } from './quick-look-model';

export function useQuickLookKeys(active: boolean, onKey: (key: QuickLookKey) => void): void {
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const key = quickLookKeyFor(keyPressOf(event));
    if (key === null) return;
    event.preventDefault();
    onKey(key);
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      handle(event);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active]);
}
