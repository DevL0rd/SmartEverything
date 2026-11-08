import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateFlags } from '../developer/flags';
import { allOff } from '../developer/toggles';
import { RootProfiler } from './profiling-host';

vi.mock('expo-router', () => ({ useSegments: (): readonly string[] => [] }));
vi.mock('./frame-probe', () => ({ recordCommit: vi.fn() }));
vi.mock('./leak-probe', () => ({ setQueryReader: vi.fn() }));
vi.mock('./profiling-suite', () => ({ reconcileProbes: vi.fn() }));
vi.mock('./startup-probe', () => ({ markFirstCommit: vi.fn(), markFirstRoute: vi.fn() }));
vi.mock('./window-bus', () => ({ setScreen: vi.fn() }));

beforeEach(() => {
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

describe('root profiling', () => {
  it('keeps the mounted navigation subtree when frame profiling changes', () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    function Navigation(): ReactNode {
      useEffect(() => {
        mount();
        return (): void => {
          unmount();
        };
      }, []);
      return null;
    }
    const root = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    const off = allOff();
    activateFlags(off);
    try {
      act(() => {
        const content = { children: createElement(Navigation) };
        root.render(createElement(RootProfiler, content));
      });
      act(() => {
        activateFlags({ ...off, 'perf.frames': true });
      });
      act(() => {
        activateFlags(off);
      });
      expect(mount).toHaveBeenCalledTimes(1);
      expect(unmount).not.toHaveBeenCalled();
    } finally {
      act(() => {
        root.unmount();
      });
      activateFlags(off);
    }
  });
});
