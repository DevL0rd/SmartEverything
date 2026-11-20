import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Timing {
  readonly target: number;
  readonly done: (finished: boolean) => void;
}

interface Probe {
  paused: boolean;
  readonly timings: Timing[];
  readonly writes: number[];
  cancels: number;
}

const probe: Probe = vi.hoisted(() => ({
  paused: false,
  timings: [],
  writes: [],
  cancels: 0,
}));

vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  class Animation {
    constructor(readonly timing: Timing) {}
  }
  return {
    Easing: { out: (curve: unknown): unknown => curve, cubic: (): number => 0 },
    useSharedValue: <T>(initial: T): { get: () => T; set: (next: T | Animation) => void } => {
      const box = useRef<{ value: T } | null>(null);
      box.current ??= { value: initial };
      const held = box.current;
      return {
        get: (): T => held.value,
        set: (next: T | Animation): void => {
          if (next instanceof Animation) {
            probe.timings.push(next.timing);
            return;
          }
          held.value = next;
          if (typeof next === 'number') probe.writes.push(next);
        },
      };
    },
    withTiming: (target: number, _: unknown, done: (finished: boolean) => void): Animation =>
      new Animation({ target, done }),
    cancelAnimation: (): void => {
      probe.cancels += 1;
    },
  };
});

vi.mock('../design/screen-pause', () => ({ useScreenPaused: (): boolean => probe.paused }));

const { useDraw } = await import('./use-draw');

function Ring({
  target,
  ticking,
}: {
  readonly target: number;
  readonly ticking: boolean;
}): ReactNode {
  useDraw(target, true, ticking);
  return null;
}

let root: Root;

function show(target: number, ticking: boolean): void {
  act(() => {
    root.render(createElement(Ring, { target, ticking }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  probe.paused = false;
  probe.timings.length = 0;
  probe.writes.length = 0;
  probe.cancels = 0;
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

function tickSeconds(from: number, seconds: number, ticking: boolean): void {
  for (let second = 1; second <= seconds; second += 1) show(from - second / 100, ticking);
}

describe('useDraw', () => {
  it('draws a ticking value in once, then follows each tick without starting an animation', () => {
    show(0.9, true);
    expect(probe.timings).toHaveLength(1);
    act(() => {
      probe.timings[0]?.done(true);
    });
    tickSeconds(0.9, 30, true);
    expect(probe.timings).toHaveLength(1);
    expect(probe.writes).toHaveLength(30);
    expect(probe.writes.at(-1)).toBeCloseTo(0.6);
  });

  it('keeps animating a ticking value until its first draw has finished', () => {
    show(0.9, true);
    show(0.89, true);
    expect(probe.timings).toHaveLength(2);
    act(() => {
      probe.timings[0]?.done(false);
      probe.timings[1]?.done(true);
    });
    show(0.88, true);
    expect(probe.timings).toHaveLength(2);
    expect(probe.writes).toEqual([0.88]);
  });

  it('still animates every change of a value that does not tick', () => {
    show(0.9, false);
    probe.timings[0]?.done(true);
    tickSeconds(0.9, 5, false);
    expect(probe.timings).toHaveLength(6);
    expect(probe.writes).toHaveLength(0);
  });

  it('cancels the draw and writes nothing while the screen is paused', () => {
    probe.paused = true;
    show(0.9, true);
    tickSeconds(0.9, 5, true);
    expect(probe.timings).toHaveLength(0);
    expect(probe.writes).toHaveLength(0);
    expect(probe.cancels).toBe(6);
  });
});
