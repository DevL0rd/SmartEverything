import { useRef } from 'react';
import { HOVER_MS, hoverStep, noHover, type Hover } from './nav-hover';

export interface HoverTarget<T> {
  readonly observe: (candidate: T | null) => void;
  readonly armed: () => T | null;
  readonly reset: () => void;
}

export function useHoverTarget<T>(onArm: (target: T) => void): HoverTarget<T> {
  const hover = useRef<Hover<T>>(noHover());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const elapsed = (): void => {
    timer.current = null;
    const next = hoverStep(hover.current, { kind: 'elapsed' });
    if (next === hover.current || next.candidate === null) return;
    hover.current = next;
    onArm(next.candidate);
  };
  return {
    observe: (candidate): void => {
      const next = hoverStep(hover.current, { kind: 'over', candidate });
      if (next === hover.current) return;
      hover.current = next;
      stop();
      if (candidate !== null) timer.current = setTimeout(elapsed, HOVER_MS);
    },
    armed: (): T | null => (hover.current.armed ? hover.current.candidate : null),
    reset: (): void => {
      stop();
      hover.current = noHover();
    },
  };
}
