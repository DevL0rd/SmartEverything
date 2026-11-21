import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Probe {
  readonly timings: number[];
  readonly writes: number[];
  readonly done: ((finished: boolean) => void)[];
}

const probe: Probe = vi.hoisted(() => ({ timings: [], writes: [], done: [] }));

const passthrough = vi.hoisted(
  () =>
    function passthrough(props: { readonly children?: unknown }): ReactNode {
      return [props.children].flat().filter((child) => isValidElement(child));
    },
);

vi.mock('react-native', () => ({
  View: passthrough,
  StyleSheet: { absoluteFill: {} },
}));

vi.mock('react-native-svg', () => ({
  default: passthrough,
  Circle: (): null => null,
  Path: (): null => null,
  Line: (): null => null,
}));

vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  class Animation {
    constructor(
      readonly target: number,
      readonly done: (finished: boolean) => void,
    ) {}
  }
  return {
    default: { View: passthrough, createAnimatedComponent: () => (): null => null },
    Easing: { out: (curve: unknown): unknown => curve, cubic: (): number => 0 },
    useAnimatedProps: (): object => ({}),
    useAnimatedStyle: (): object => ({}),
    useSharedValue: <T>(initial: T): { get: () => T; set: (next: T | Animation) => void } => {
      const box = useRef<{ value: T } | null>(null);
      box.current ??= { value: initial };
      const held = box.current;
      return {
        get: (): T => held.value,
        set: (next: T | Animation): void => {
          if (next instanceof Animation) {
            probe.timings.push(next.target);
            probe.done.push(next.done);
            return;
          }
          held.value = next;
          if (typeof next === 'number') probe.writes.push(next);
        },
      };
    },
    withTiming: (target: number, _: unknown, done: (finished: boolean) => void): Animation =>
      new Animation(target, done),
    cancelAnimation: (): undefined => undefined,
  };
});

vi.mock('../text', () => ({ Text: (): null => null }));
vi.mock('../../design/colour', () => ({
  useColour: (role: string): string => role,
  useColourResolver: (): ((role: string) => string) => (role) => role,
}));
vi.mock('../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));

const { ProgressBar } = await import('./progress-bar');
const { Gauge } = await import('./gauge');

let root: Root;

function bar(progress: number, ticking: boolean): void {
  act(() => {
    root.render(
      createElement(ProgressBar, { progress, colour: 'primary', label: 'Left', ticking }),
    );
  });
}

function gauge(value: number, ticking: boolean): void {
  act(() => {
    root.render(
      createElement(Gauge, {
        value,
        min: 0,
        max: 100,
        size: 120,
        label: 'Left',
        bands: [{ upTo: 100, colour: 'primary' }],
        ticking,
      }),
    );
  });
}

function settle(): void {
  act(() => {
    for (const done of probe.done) done(true);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  probe.timings.length = 0;
  probe.writes.length = 0;
  probe.done.length = 0;
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

describe('ProgressBar draw-in', () => {
  it('draws a ticking value in once, then sets each new second without a new animation', () => {
    bar(1, true);
    settle();
    for (let second = 1; second <= 10; second += 1) bar(1 - second / 15, true);
    expect(probe.timings).toEqual([1]);
    expect(probe.writes).toHaveLength(10);
    expect(probe.writes.at(-1)).toBeCloseTo(1 - 10 / 15);
  });

  it('animates every change of a value that does not tick', () => {
    bar(0.2, false);
    settle();
    for (let step = 1; step <= 3; step += 1) bar(0.2 + step / 10, false);
    expect(probe.timings).toHaveLength(4);
    expect(probe.writes).toHaveLength(0);
  });
});

describe('Gauge draw-in', () => {
  it('draws a ticking value in once, then sets each new second without a new animation', () => {
    gauge(60, true);
    settle();
    for (let second = 1; second <= 10; second += 1) gauge(60 - second, true);
    expect(probe.timings).toEqual([0.6]);
    expect(probe.writes).toHaveLength(10);
    expect(probe.writes.at(-1)).toBeCloseTo(0.5);
  });

  it('animates every change of a value that does not tick', () => {
    gauge(20, false);
    settle();
    for (let step = 1; step <= 3; step += 1) gauge(20 + step * 10, false);
    expect(probe.timings).toHaveLength(4);
    expect(probe.writes).toHaveLength(0);
  });
});
