import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from './screen-pause';

interface Window {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly fontScale: number;
}

const screen = vi.hoisted(() => ({
  window: { width: 412, height: 915, scale: 1, fontScale: 1 },
  listeners: new Set<() => void>(),
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Dimensions: {
    get: (): Window => screen.window,
    addEventListener: (_: string, listener: () => void): { remove: () => void } => {
      screen.listeners.add(listener);
      return {
        remove: (): void => {
          screen.listeners.delete(listener);
        },
      };
    },
  },
}));

const { useSizeClass, useWindowSize } = await import('./size-class');

let frames: (() => void)[] = [];

function nextFrame(): void {
  const due = frames;
  frames = [];
  for (const frame of due) frame();
}

function resize(width: number, height: number): void {
  act(() => {
    screen.window = { width, height, scale: 1, fontScale: 1 };
    for (const listener of screen.listeners) listener();
  });
}

const renders = { shown: 0, paused: 0 };
const seen = { shown: 0, paused: 0 };

function Consumer({ name }: { readonly name: keyof typeof renders }): ReactNode {
  const area = useSizeClass().area;
  const { width } = useWindowSize();
  useEffect(() => {
    renders[name] += 1;
    seen[name] = Math.max(area, width);
  });
  return null;
}

function mount(paused: ScreenPause): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render([
      createElement(Consumer, { key: 'shown', name: 'shown' }),
      createElement(
        ScreenPausedContext,
        { key: 'paused', value: paused },
        createElement(Consumer, { name: 'paused' }),
      ),
    ]);
  });
}

beforeEach(() => {
  frames = [];
  Object.assign(renders, { shown: 0, paused: 0 });
  screen.window = { width: 412, height: 915, scale: 1, fontScale: 1 };
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the window size during a resize', () => {
  it('re-renders only shown screens and catches a paused one up once on resume', () => {
    const paused = new ScreenPause(null, true);
    paused.attach();
    mount(paused);
    const mounted = { ...renders };
    for (const width of [884, 412, 360, 700, 1024, 1440]) resize(width, 900);
    expect(renders.shown - mounted.shown).toBe(6);
    expect(renders.paused).toBe(mounted.paused);
    act(() => {
      paused.setOwn(false);
      nextFrame();
    });
    expect(renders.paused - mounted.paused).toBe(1);
    expect(seen.paused).toBe(1440);
  });
});
