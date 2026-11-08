import { use, useEffect, useEffectEvent } from 'react';
import { useScreenLive } from '../../../../design/animation-gate';
import { ScreenPausedContext, useScreenPaused } from '../../../../design/screen-pause';
import { isNative } from '../../../../design/platform';
import type { KeyPress } from './object-actions';

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useDocumentKeys(active: boolean, onKey: (press: KeyPress) => boolean): boolean {
  const pause = use(ScreenPausedContext);
  const paused = useScreenPaused();
  const { focused, foreground } = useScreenLive();
  const enabled = active && !paused && focused && foreground;
  const run = useEffectEvent((press: KeyPress) =>
    enabled && !pause.isPaused() ? onKey(press) : false,
  );
  useEffect(() => {
    if (!enabled || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.isComposing || typing(event.target)) return;
      const press = { key: event.key, shift: event.shiftKey, mod: event.ctrlKey || event.metaKey };
      if (run(press)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', listen, { capture: true });
    return (): void => {
      document.removeEventListener('keydown', listen, { capture: true });
    };
  }, [enabled]);
  return enabled;
}
