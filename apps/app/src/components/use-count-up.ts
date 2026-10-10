import { use, useEffect, useRef, useState } from 'react';
import { DURATION } from '../design/motion';
import { ScreenPausedContext } from '../design/screen-pause';

function ease(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function tween(
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

const NUMBER = /^-?\d+(\.\d+)?$/;

interface Parsed {
  readonly value: number;
  readonly decimals: number;
}

function parse(written: string): Parsed | null {
  if (!NUMBER.test(written)) {
    return null;
  }
  return { value: Number(written), decimals: written.split('.')[1]?.length ?? 0 };
}

export function useCountUp(value: string, enabled: boolean): string {
  const paused = use(ScreenPausedContext);
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const from = parse(previous.current);
    const to = parse(value);
    previous.current = value;
    if (paused || !enabled || from === null || to === null || from.value === to.value) {
      setShown(value);
      return undefined;
    }
    return tween(from.value, to.value, DURATION.long, (current) => {
      setShown(current.toFixed(to.decimals));
    });
  }, [value, enabled, paused]);
  return shown;
}
