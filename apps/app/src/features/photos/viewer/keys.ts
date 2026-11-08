import { useEffect, useEffectEvent } from 'react';
import { keyPressOf, type KeyPress } from '../../../design/keyboard';
import { isNative } from '../../../design/platform';

export type ViewerKeyAction = 'previous' | 'next' | 'favourite' | 'info';

const KEYS: Readonly<Record<string, ViewerKeyAction>> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  f: 'favourite',
  F: 'favourite',
  i: 'info',
  I: 'info',
};

export function viewerKeyAction(press: KeyPress): ViewerKeyAction | null {
  if (press.typing || press.command || press.alt) return null;
  return KEYS[press.key] ?? null;
}

export function useViewerKeys(active: boolean, onAction: (action: ViewerKeyAction) => void): void {
  const handle = useEffectEvent((event: KeyboardEvent): void => {
    const action = viewerKeyAction(keyPressOf(event));
    if (action === null) return;
    event.preventDefault();
    onAction(action);
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
