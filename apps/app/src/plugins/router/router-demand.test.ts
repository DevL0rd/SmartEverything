import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../../design/screen-pause';
import { liveWatch } from '../../store/live-watch';
import type * as AnimationGate from '../../design/animation-gate';
import { useWatchedRouterSnapshot } from './router-data';

vi.mock('../../design/animation-gate', async (original) => ({
  ...(await original<typeof AnimationGate>()),
  useForeground: (): boolean => true,
}));

vi.mock('../shared/use-plugin-stream', () => ({
  usePluginStream: (): { readonly state: 'waiting' } => ({ state: 'waiting' }),
}));

const ROUTER = { id: 'router-device' };

let root: Root | null = null;

function Probe(): ReactNode {
  useWatchedRouterSnapshot(ROUTER);
  return null;
}

function mount(pause: ScreenPause): void {
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  root = created;
  act(() => {
    created.render(createElement(ScreenPausedContext, { value: pause }, createElement(Probe)));
  });
}

function held(): readonly string[] {
  return [...liveWatch.topicsOf(ROUTER.id)];
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    callback();
    return 0;
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

describe('a router section reading the live stream', () => {
  it('holds the router view while shown, drops it while paused and on unmount', () => {
    const pause = new ScreenPause(null);
    mount(pause);
    expect(held()).toEqual(['live']);
    act(() => {
      pause.setOwn(true);
    });
    expect(held()).toEqual([]);
    act(() => {
      pause.setOwn(false);
    });
    expect(held()).toEqual(['live']);
    act(() => {
      root?.unmount();
    });
    root = null;
    expect(held()).toEqual([]);
  });
});
