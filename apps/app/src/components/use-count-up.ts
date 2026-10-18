import { useEffect, useRef, useState } from 'react';
import { DURATION } from '../design/motion';
import { useScreenPaused } from '../design/screen-pause';

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

export function isCountable(written: string): boolean {
  return NUMBER.test(written);
}

export type CountPlan =
  | { readonly kind: 'jump' }
  | {
      readonly kind: 'tween';
      readonly from: number;
      readonly to: number;
      readonly decimals: number;
    };

export function countPlan(
  previous: string,
  value: string,
  animate: boolean,
  minChange = 0,
): CountPlan {
  const from = parse(previous);
  const to = parse(value);
  if (!animate || from === null || to === null || from.value === to.value) {
    return { kind: 'jump' };
  }
  if (Math.abs(to.value - from.value) < minChange * Math.max(Math.abs(from.value), 1)) {
    return { kind: 'jump' };
  }
  return { kind: 'tween', from: from.value, to: to.value, decimals: to.decimals };
}

export function useCountUp(value: string, enabled: boolean, minChange = 0): string {
  const paused = useScreenPaused();
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const plan = countPlan(previous.current, value, enabled && !paused, minChange);
    previous.current = value;
    if (plan.kind === 'jump') {
      setShown(value);
      return undefined;
    }
    return tween(plan.from, plan.to, DURATION.long, (current) => {
      setShown(current.toFixed(plan.decimals));
    });
  }, [value, enabled, paused, minChange]);
  return shown;
}
