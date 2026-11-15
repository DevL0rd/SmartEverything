import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type * as PlatformModule from './platform';
import type { Idiom } from './tokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Dimensions: { get: (): { width: number; height: number } => ({ width: 1600, height: 1000 }) },
  Platform: { OS: 'web' },
}));

interface FakeQuery {
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

const media: { calls: number; queries: FakeQuery[]; coarse: boolean } = {
  calls: 0,
  queries: [],
  coarse: false,
};

function matchMedia(): FakeQuery {
  media.calls += 1;
  const query: FakeQuery = {
    get matches(): boolean {
      return media.coarse;
    },
    listeners: new Set(),
    addEventListener: (_type, listener): void => {
      query.listeners.add(listener);
    },
    removeEventListener: (_type, listener): void => {
      query.listeners.delete(listener);
    },
  };
  media.queries.push(query);
  return query;
}

function liveListeners(): number {
  return media.queries.reduce((total, query) => total + query.listeners.size, 0);
}

function fireChange(): void {
  for (const query of media.queries) {
    for (const listener of [...query.listeners]) {
      listener();
    }
  }
}

const CONSUMERS = 400;
const seen: Idiom[] = [];
let renders = 0;

async function mount(): Promise<{ platform: typeof PlatformModule; root: Root }> {
  vi.resetModules();
  const platform = await import('./platform');
  const Consumer = (): ReactNode => {
    renders += 1;
    seen.push(platform.useIdiom());
    return null;
  };
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(
      Array.from({ length: CONSUMERS }, (_, index) => createElement(Consumer, { key: index })),
    );
  });
  return { platform, root };
}

beforeEach(() => {
  Object.assign(media, { calls: 0, queries: [], coarse: false });
  seen.length = 0;
  renders = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
    matchMedia,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('web idiom subscription', () => {
  it('shares one media query and one change listener across every consumer', async () => {
    const { root } = await mount();
    expect(media.calls).toBe(1);
    expect(liveListeners()).toBe(1);
    expect(seen.every((idiom) => idiom === 'pointer')).toBe(true);
    act(() => {
      root.unmount();
    });
    expect(liveListeners()).toBe(0);
    expect(media.calls).toBe(1);
  });

  it('re-renders every consumer once when the pointer turns coarse, without new queries', async () => {
    const { root } = await mount();
    const before = renders;
    seen.length = 0;
    act(() => {
      media.coarse = true;
      fireChange();
    });
    expect(renders - before).toBe(CONSUMERS);
    expect(seen.every((idiom) => idiom === 'touch')).toBe(true);
    expect(media.calls).toBe(1);
    act(() => {
      root.unmount();
    });
  });

  it('keeps the shared listener while another subscriber such as the theme store remains', async () => {
    const { platform, root } = await mount();
    let themeWakes = 0;
    const stop = platform.onIdiomChange(() => {
      themeWakes += 1;
    });
    act(() => {
      root.unmount();
    });
    expect(liveListeners()).toBe(1);
    fireChange();
    expect(themeWakes).toBe(1);
    stop();
    expect(liveListeners()).toBe(0);
    expect(platform.idiomNow()).toBe('pointer');
    expect(media.calls).toBe(1);
  });
});
