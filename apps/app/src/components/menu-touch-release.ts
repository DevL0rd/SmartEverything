import { useEffect, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { idiomNow, isNative } from '../design/platform';

function suppressRelease(): AbortController {
  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };
  const clear = (): void => {
    controller.abort();
  };
  window.addEventListener(
    'click',
    (event): void => {
      if (event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clear();
    },
    options,
  );
  window.addEventListener('pointerdown', clear, options);
  window.addEventListener('touchstart', clear, options);
  window.addEventListener('touchcancel', clear, options);
  window.addEventListener('blur', clear, { signal: controller.signal });
  return controller;
}

export function useMenuTouchRelease(): (event: GestureResponderEvent | undefined) => void {
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => (): void => {
      active.current?.abort();
    },
    [],
  );
  return (event): void => {
    if (event === undefined || isNative() || idiomNow() !== 'touch') return;
    active.current?.abort();
    active.current = suppressRelease();
  };
}
