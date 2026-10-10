import { useEffect } from 'react';
import { isNative } from '../../../design/platform';
import type { CallControlHandlers } from './model/call-controls';

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useCallShortcuts(enabled: boolean, handlers: CallControlHandlers): void {
  const { onMute, onCamera, onShare, onSettings, onEnd } = handlers;
  useEffect(() => {
    if (!enabled || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (typing(event.target)) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        onEnd();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const run = { m: onMute, v: onCamera, s: onShare, ',': onSettings }[event.key.toLowerCase()];
      if (run !== undefined) {
        event.preventDefault();
        run();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [enabled, onMute, onCamera, onShare, onSettings, onEnd]);
}
