import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../../../../design/screen-pause';

interface Probe {
  reads: number;
  frames: number;
  focused: boolean;
  foreground: boolean;
  readonly queue: (() => void)[];
}

interface Level {
  readonly get: () => number;
  readonly set: (next: number) => void;
}

const probe: Probe = vi.hoisted(() => ({
  reads: 0,
  frames: 0,
  focused: true,
  foreground: true,
  queue: [],
}));

vi.mock('react-native-reanimated', () => ({
  useSharedValue: (initial: number): Level => {
    let value = initial;
    return {
      get: (): number => value,
      set: (next: number): void => {
        value = next;
      },
    };
  },
}));

vi.mock('../engine/engine', () => ({
  callEngine: {
    levels: {
      kind: 'poll',
      read: (): { readonly in: number; readonly out: number } => {
        probe.reads += 1;
        return { in: 0.5, out: 0.25 };
      },
    },
  },
}));

vi.mock('../../../../design/animation-gate', () => ({
  useScreenLive: (): { readonly focused: boolean; readonly foreground: boolean } => ({
    focused: probe.focused,
    foreground: probe.foreground,
  }),
}));

vi.mock('../../../../design/visibility', () => ({ useScopeVisible: (): boolean => true }));

const { useEngineLevel } = await import('./use-call-level');

function Meter(): ReactNode {
  useEngineLevel('input');
  return null;
}

function runFrames(count: number): void {
  for (let index = 0; index < count; index += 1) {
    const due = probe.queue.splice(0);
    for (const frame of due) frame();
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (frame: () => void) => {
    probe.frames += 1;
    probe.queue.push(frame);
    return probe.frames;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    probe.queue.length = 0;
  });
  probe.reads = 0;
  probe.frames = 0;
  probe.queue.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Screen {
  readonly focused: boolean;
  readonly foreground: boolean;
  readonly paused: boolean;
}

const LIVE: Screen = { focused: true, foreground: true, paused: false };

function mounted({ focused, foreground, paused }: Screen): () => void {
  probe.focused = focused;
  probe.foreground = foreground;
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(
      createElement(
        ScreenPausedContext,
        { value: new ScreenPause(null, paused) },
        createElement(Meter),
      ),
    );
  });
  return (): void => {
    act(() => {
      root.unmount();
    });
  };
}

describe('the call level poll', () => {
  it('reads the level every frame while the call room is live', () => {
    const unmount = mounted(LIVE);
    runFrames(60);
    expect(probe.reads).toBe(60);
    unmount();
  });

  it.each([
    ['unfocused', { ...LIVE, focused: false }],
    ['in the background', { ...LIVE, foreground: false }],
    ['paused', { ...LIVE, paused: true }],
  ])('requests no frames while the call room is %s', (_, screen) => {
    const unmount = mounted(screen);
    runFrames(60);
    expect(probe.frames).toBe(0);
    expect(probe.reads).toBe(0);
    unmount();
  });
});
