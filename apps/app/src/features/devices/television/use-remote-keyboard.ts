import { useEffect } from 'react';
import { isNative, useIdiom } from '../../../design/platform';
import { useStableCallback } from '../../../design/use-stable-callback';
import { keyboardAction, type KeyboardAction } from './keyboard';

const KEPT_FROM_BUTTONS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  ...Array.from({ length: 10 }, (_, digit) => String(digit)),
]);

function takenByControl(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    return true;
  }
  return !KEPT_FROM_BUTTONS.has(event.key) && target.closest('button,[role="button"]') !== null;
}

export function useRemoteKeyboard(
  active: boolean,
  run: (action: KeyboardAction) => boolean,
): boolean {
  const pointer = useIdiom() === 'pointer';
  const enabled = active && pointer && !isNative();
  const act = useStableCallback(run);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      const action = keyboardAction(event);
      if (action === null || takenByControl(event)) {
        return;
      }
      if (act(action)) {
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [enabled, act]);
  return enabled;
}
