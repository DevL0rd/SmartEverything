import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Animated from 'react-native-reanimated';
import { makeMutable, useAnimatedRef, type SharedValue } from 'react-native-reanimated';
import { ScreenScrollContext } from '../../../components/screen-context';
import { fanSpec } from '../visual/visual-fixture';
import type { LiveModelViewProps } from './use-live-view';

interface Shared<Value> {
  readonly get: () => Value;
  readonly set: (next: Value | ((current: Value) => Value)) => void;
}

interface Mapper {
  readonly prepare: () => unknown;
  readonly react: (value: unknown, previous: unknown) => void;
  last: string;
}

interface Sim {
  measures: number;
  placed: number;
  live: boolean;
  scrollY: number;
  readonly frames: Set<() => void>;
  readonly mappers: Set<Mapper>;
  onLayout: (() => void) | null;
}

const sim = vi.hoisted((): Sim => ({
  measures: 0,
  placed: 0,
  live: true,
  scrollY: 0,
  frames: new Set<() => void>(),
  mappers: new Set<Mapper>(),
  onLayout: null,
}));

function shared<Value>(initial: Value): Shared<Value> {
  let value = initial;
  return {
    get: (): Value => value,
    set: (next): void => {
      value = next instanceof Function ? next(value) : next;
    },
  };
}

vi.mock('react-native-reanimated', async () => {
  const { useEffect, useState } = await import('react');
  function useShared<Value>(initial: Value): Shared<Value> {
    const [value] = useState(() => shared(initial));
    return value;
  }
  return {
    default: { View: (): null => null },
    makeMutable: shared,
    measure: (): { pageX: number; pageY: number; width: number; height: number } => {
      sim.measures += 1;
      return { pageX: 0, pageY: 200 - sim.scrollY, width: 96, height: 96 };
    },
    useAnimatedRef: (): object => ({}),
    useAnimatedStyle: (): object => ({}),
    useSharedValue: useShared,
    useFrameCallback: (callback: () => void): { setActive: (on: boolean) => void } => ({
      setActive: (on): void => {
        if (on) sim.frames.add(callback);
        else sim.frames.delete(callback);
      },
    }),
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ): void => {
      useEffect(() => {
        const value = prepare();
        const mapper: Mapper = { prepare, react, last: JSON.stringify(value) };
        sim.mappers.add(mapper);
        react(value, null);
        return (): void => {
          sim.mappers.delete(mapper);
        };
      }, [prepare, react]);
    },
  };
});
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (): void => {
    sim.placed += 1;
  },
}));
vi.mock('../../../design/animation-gate', () => ({ useForeground: (): boolean => true }));
vi.mock('./live-overlay', () => ({ default: (): null => null }));
vi.mock('./native-model-face', () => ({
  NativeModelFace: ({ onLayout }: { readonly onLayout: (() => void) | undefined }): null => {
    sim.onLayout = onLayout ?? null;
    return null;
  },
}));
vi.mock('./use-live-view', () => ({
  useForegroundBinding: (): void => undefined,
  useLiveView: (): { live: boolean; drawn: boolean; onLayout: () => void } => ({
    live: sim.live,
    drawn: false,
    onLayout: (): void => undefined,
  }),
}));

const { LiveModelView } = await import('./live-view');

function frame(): void {
  for (const callback of sim.frames) callback();
  for (const mapper of sim.mappers) {
    const value = mapper.prepare();
    const key = JSON.stringify(value);
    if (key === mapper.last) continue;
    const previous: unknown = JSON.parse(mapper.last);
    mapper.last = key;
    mapper.react(value, previous);
  }
}

function frames(count: number, each: () => void = (): void => undefined): number {
  const before = sim.measures;
  for (let index = 0; index < count; index += 1) {
    each();
    frame();
  }
  return sim.measures - before;
}

const PROPS: LiveModelViewProps = {
  id: 'hero',
  spec: fanSpec(),
  model: { specHash: 'fan', lod: 0, finish: null, params: {} },
  view: 'card',
  px: 96,
  signals: {},
  still: null,
  liveWhen: 'visible',
};

interface Scroll {
  readonly offset: SharedValue<number>;
  readonly layout: SharedValue<number>;
}

function screenScroll(): Scroll {
  return { offset: makeMutable(0), layout: makeMutable(0) };
}

function Screen({ scroll }: { readonly scroll: Scroll | null }): ReactNode {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const value =
    scroll === null ? null : { scrollRef, scrollY: scroll.offset, layout: scroll.layout };
  return createElement(ScreenScrollContext, { value }, createElement(LiveModelView, PROPS));
}

function mount(scroll: Scroll | null): Root {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Screen, { scroll }));
  });
  return root;
}

const SECOND = 60;

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
  sim.measures = 0;
  sim.placed = 0;
  sim.live = true;
  sim.scrollY = 0;
  sim.frames.clear();
  sim.mappers.clear();
  sim.onLayout = null;
});

describe('the overlay model placement', () => {
  it('measures nothing while a still view sits on an idle screen', () => {
    const scroll = screenScroll();
    const root = mount(scroll);
    const idle = frames(SECOND);
    expect(idle).toBe(0);
    act(() => {
      root.unmount();
    });
  });

  it('re-measures once per scroll step, own layout and clip layout change', () => {
    const scroll = screenScroll();
    const root = mount(scroll);
    const scrolled = frames(10, () => {
      sim.scrollY += 4;
      scroll.offset.set(sim.scrollY);
    });
    expect(scrolled).toBe(20);
    const own = frames(1, () => sim.onLayout?.());
    expect(own).toBe(2);
    const clip = frames(1, () => {
      scroll.layout.set((current) => current + 1);
    });
    expect(clip).toBe(2);
    expect(frames(SECOND)).toBe(0);
    act(() => {
      root.unmount();
    });
  });

  it('measures once on layout and never again without a scroll context', () => {
    const root = mount(null);
    expect(sim.measures).toBe(1);
    expect(frames(SECOND)).toBe(0);
    expect(frames(1, () => sim.onLayout?.())).toBe(1);
    act(() => {
      root.unmount();
    });
  });

  it('stops measuring while the view is paused', () => {
    sim.live = false;
    const scroll = screenScroll();
    const root = mount(scroll);
    const paused = frames(SECOND, () => {
      sim.scrollY += 4;
      scroll.offset.set(sim.scrollY);
    });
    expect(paused).toBe(0);
    expect(sim.placed).toBe(0);
    act(() => {
      root.unmount();
    });
  });
});
