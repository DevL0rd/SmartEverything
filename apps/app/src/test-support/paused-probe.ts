import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import { ScreenPause, ScreenPausedContext } from '../design/screen-pause';

export const NOTICES = 6;

export interface Probe<T> {
  readonly renders: () => number;
  readonly value: () => T | undefined;
}

export interface PausedProbes {
  readonly mount: <T>(pause: ScreenPause, use: () => T) => Probe<T>;
  readonly pausedScreen: () => ScreenPause;
  readonly resume: (pause: ScreenPause) => void;
}

interface ProbeRig {
  root: Root | null;
  frames: (() => void)[];
}

function mountIn<T>(
  pause: ScreenPause,
  use: () => T,
): { readonly root: Root; readonly probe: Probe<T> } {
  let renders = 0;
  let value: T | undefined;
  function Reader(): ReactNode {
    renders += 1;
    value = use();
    return null;
  }
  const created = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    created.render(createElement(ScreenPausedContext, { value: pause }, createElement(Reader)));
  });
  return { root: created, probe: { renders: () => renders, value: () => value } };
}

export function pausedProbes(): PausedProbes {
  const rig: ProbeRig = { root: null, frames: [] };
  beforeEach(() => {
    rig.frames = [];
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
      rig.frames.push(callback);
      return rig.frames.length;
    });
  });
  afterEach(() => {
    act(() => {
      rig.root?.unmount();
    });
    rig.root = null;
    vi.unstubAllGlobals();
  });
  return {
    mount: <T>(pause: ScreenPause, use: () => T): Probe<T> => {
      const mounted = mountIn(pause, use);
      rig.root = mounted.root;
      return mounted.probe;
    },
    pausedScreen: (): ScreenPause => {
      const pause = new ScreenPause(null);
      pause.setOwn(true);
      return pause;
    },
    resume: (pause: ScreenPause): void => {
      act(() => {
        pause.setOwn(false);
        const due = rig.frames;
        rig.frames = [];
        for (const frame of due) frame();
      });
    },
  };
}
