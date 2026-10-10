import { useEffect, useRef, useState } from 'react';

export const DRAW_MS = 700;

function ease(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function tween(
  from: number,
  to: number,
  duration: number,
  onFrame: (value: number) => void,
): () => void {
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now: number): void {
    const progress = Math.min(1, (now - start) / duration);
    onFrame(from + (to - from) * ease(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    }
  });
  return (): void => {
    cancelAnimationFrame(frame);
  };
}

export function useTween(value: number, enabled: boolean, duration = DRAW_MS): number {
  const [shown, setShown] = useState(enabled ? 0 : value);
  const previous = useRef(enabled ? 0 : value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (!enabled || from === value) {
      setShown(value);
      return undefined;
    }
    return tween(from, value, duration, setShown);
  }, [value, enabled, duration]);
  return shown;
}
