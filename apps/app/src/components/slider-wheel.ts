import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { isNative } from '../design/platform';
import { snap } from './charts/scale';

const PIXELS_PER_STEP = 100;
const PIXELS_PER_LINE = 40;
const SETTLE_MS = 400;

export interface WheelTarget {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly preview: (next: number) => void;
  readonly commit: (next: number) => void;
}

function deltaOf(event: WheelEvent): number {
  const scale = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : PIXELS_PER_LINE;
  const along = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
  return along * scale;
}

class WheelRun {
  private pending = 0;
  private current: number | null = null;
  private settle: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly latest: RefObject<WheelTarget>) {}

  readonly turn = (event: WheelEvent): void => {
    const target = this.latest.current;
    const from = this.current ?? target.value;
    this.pending += deltaOf(event);
    if ((this.pending > 0 && from >= target.max) || (this.pending < 0 && from <= target.min)) {
      this.pending = 0;
      return;
    }
    event.preventDefault();
    const steps = Math.trunc(this.pending / PIXELS_PER_STEP);
    if (steps === 0) {
      return;
    }
    this.pending -= steps * PIXELS_PER_STEP;
    this.current = snap(from + steps * target.step, target, target.step);
    target.preview(this.current);
    clearTimeout(this.settle);
    this.settle = setTimeout(this.finish, SETTLE_MS);
  };

  readonly finish = (): void => {
    clearTimeout(this.settle);
    const done = this.current;
    this.current = null;
    this.pending = 0;
    if (done !== null) {
      this.latest.current.commit(done);
    }
  };
}

export function useWheelSteps(
  frame: RefObject<View | null>,
  enabled: boolean,
  target: WheelTarget,
): void {
  const latest = useRef(target);
  useEffect(() => {
    latest.current = target;
  });
  useEffect(() => {
    const node = frame.current;
    if (!enabled || isNative() || !(node instanceof HTMLElement)) {
      return undefined;
    }
    const run = new WheelRun(latest);
    node.addEventListener('wheel', run.turn, { passive: false });
    return (): void => {
      node.removeEventListener('wheel', run.turn);
      run.finish();
    };
  }, [frame, enabled]);
}
