import { act, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Probe {
  now: number;
  readonly timings: number[];
  readonly writes: number[];
  readonly done: ((finished: boolean) => void)[];
}

const probe: Probe = vi.hoisted(() => ({ now: 0, timings: [], writes: [], done: [] }));

const passthrough = vi.hoisted(
  () =>
    function passthrough(props: { readonly children?: unknown }): ReactNode {
      return [props.children].flat().filter((child) => isValidElement(child));
    },
);

vi.mock('react-native', () => ({ View: passthrough }));

vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  class Animation {
    constructor(
      readonly target: number,
      readonly done: (finished: boolean) => void,
    ) {}
  }
  return {
    default: { View: passthrough },
    Easing: { out: (curve: unknown): unknown => curve, cubic: (): number => 0 },
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

vi.mock('../../../components/dialog-frame', () => ({
  DialogFrame: (props: { readonly children: ReactNode }): ReactNode => props.children,
}));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../store/clock', () => ({
  useSecondOf: <T>(select: (now: number) => T): T => select(probe.now),
}));
vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../../design/screen-pause', () => ({ useScreenPaused: (): boolean => false }));

const { KeepDialog } = await import('./keep-dialog');
const { DISPLAY_REVERT_SECONDS, PENDING_REVERT } = await import('@smarteverything/domain');

const START = Date.parse('2026-11-21T10:00:00.000Z');
const PENDING = PENDING_REVERT.parse({
  token: 'revert-1',
  startedAt: new Date(START).toISOString(),
  revertsAt: new Date(START + DISPLAY_REVERT_SECONDS * 1000).toISOString(),
  summary: 'Resolution changed',
});

let root: Root;

function showAt(second: number): void {
  probe.now = START + second * 1000;
  act(() => {
    root.render(
      createElement(KeepDialog, {
        pending: PENDING,
        blank: false,
        deciding: false,
        onDecide: (): undefined => undefined,
        onExpire: (): undefined => undefined,
      }),
    );
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

describe('KeepDialog countdown bar', () => {
  it('draws the bar in once and then follows each second without restarting the animation', () => {
    showAt(0);
    act(() => {
      for (const done of probe.done) done(true);
    });
    for (let second = 1; second <= 10; second += 1) showAt(second);
    expect(probe.timings).toEqual([1]);
    expect(probe.writes).toHaveLength(10);
    expect(probe.writes.at(-1)).toBeCloseTo((DISPLAY_REVERT_SECONDS - 10) / DISPLAY_REVERT_SECONDS);
  });
});
