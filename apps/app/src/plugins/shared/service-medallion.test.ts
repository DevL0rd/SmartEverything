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
    default: { createAnimatedComponent: () => (): null => null },
    Easing: { out: (curve: unknown): unknown => curve, cubic: (): number => 0 },
    useAnimatedProps: (): object => ({}),
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

vi.mock('uniwind', () => ({ useUniwind: (): { theme: string } => ({ theme: 'dark' }) }));
vi.mock('../../components/charts', async () => ({
  Arc: (await import('../../components/charts/arc')).Arc,
}));
vi.mock('../../components/glow', () => ({ Glow: (): null => null }));
vi.mock('../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));

const { ServiceMedallion } = await import('./service-medallion');

let root: Root;

function show(ratio: number, ticking: boolean): void {
  act(() => {
    root.render(
      createElement(ServiceMedallion, {
        glyph: 'shield',
        tone: 'positive',
        ratio,
        live: false,
        size: 'hero',
        label: 'Processor',
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

describe('ServiceMedallion ring', () => {
  it('draws a ticking ratio in once, then sets each new reading without a new animation', () => {
    show(0.12, true);
    expect(probe.timings).toEqual([0.12]);
    settle();
    for (let second = 1; second <= 10; second += 1) show(0.12 + second / 100, true);
    expect(probe.timings).toEqual([0.12]);
    expect(probe.writes).toHaveLength(10);
    expect(probe.writes.at(-1)).toBeCloseTo(0.22);
  });

  it('animates every change of a ratio that does not tick', () => {
    show(0.12, false);
    settle();
    for (let second = 1; second <= 3; second += 1) show(0.12 + second / 100, false);
    expect(probe.timings).toHaveLength(4);
    expect(probe.writes).toHaveLength(0);
  });
});
