import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bakers = vi.hoisted(() => ({ mounted: 0, live: 0 }));

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));

vi.mock('./baker', () => ({
  default: function Baker(): null {
    useEffect(() => {
      bakers.mounted += 1;
      bakers.live += 1;
      return (): void => {
        bakers.live -= 1;
      };
    }, []);
    return null;
  },
}));

vi.mock('./bake-cache', () => ({
  bakeCache: {
    read: (): Promise<null> => Promise.resolve(null),
    write: (): Promise<never> => Promise.reject(new Error('unused')),
    prune: (): Promise<number> => Promise.resolve(0),
  },
}));

vi.mock('../../../store/selectors', () => ({ useLoaded: (): boolean => false }));
vi.mock('../../../store/store-context', () => ({ useEntityStore: (): object => ({}) }));

const { BakeHost, bakeChannel, modelBakeQueue } = await import('./bake-host');

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
  vi.restoreAllMocks();
  bakers.mounted = 0;
  bakers.live = 0;
});

function mount(): { readonly unmount: () => void } {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(BakeHost));
  });
  return {
    unmount: (): void => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe('the bake host', () => {
  it('creates no baker while the queue has no work', () => {
    const host = mount();
    expect(bakers.mounted).toBe(0);
    host.unmount();
  });

  it('mounts the baker only while the queue has work and releases it once the queue drains', () => {
    const detach = vi.spyOn(bakeChannel, 'detach');
    const host = mount();
    act(() => {
      modelBakeQueue.busy.set(true);
    });
    expect(bakers.live).toBe(1);
    act(() => {
      modelBakeQueue.busy.set(false);
    });
    expect(bakers.live).toBe(0);
    expect(detach).toHaveBeenCalledTimes(1);
    act(() => {
      modelBakeQueue.busy.set(true);
    });
    expect(bakers.mounted).toBe(2);
    act(() => {
      modelBakeQueue.busy.set(false);
    });
    host.unmount();
  });
});
