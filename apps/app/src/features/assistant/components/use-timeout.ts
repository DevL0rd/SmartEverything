import { useEffect, useRef } from 'react';

export interface Timeout {
  readonly start: (milliseconds: number, run: () => void) => void;
  readonly clear: () => void;
}

export function useTimeout(): Timeout {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = (): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(
    () => (): void => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );
  return {
    clear,
    start: (milliseconds, run): void => {
      clear();
      timer.current = setTimeout(run, milliseconds);
    },
  };
}
