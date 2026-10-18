import { act, createElement, Fragment, memo, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseNavigationContainer,
  createNavigationContainerRef,
  useNavigationBuilder,
} from '../../../../node_modules/expo-router/build/react-navigation/core';
import { Screen } from '../../../../node_modules/expo-router/build/react-navigation/core/Screen';
import {
  TabRouter,
  type NavigationAction,
  type ParamListBase,
  type RouterFactory,
  type TabNavigationState,
  type TabRouterOptions,
} from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { ValueStore, useValue } from '../design/external-store';
import { reduce } from './router-kit.test-util';
import { screenPause } from './screen-pause';
import { useSectionPrewarm } from './tab-prewarm';

const SECTIONS = ['index', 'activity', 'nutrition', 'heart'] as const;
const CONSUMERS = 200;

const live = new Map<string, number>();
const renderedKeys = new Set<string>();
const woken = new Set<string>();
const mounts = new Map<string, number>();
const values = new Map<string, ValueStore<number>>();
let consumerRenders = 0;
let frames: (() => void)[] = [];
let idle: (() => void)[] = [];

function noteConsumerRender(): void {
  consumerRenders += 1;
}

function valuesOf(name: string): ValueStore<number> {
  const found = values.get(name);
  if (found !== undefined) return found;
  const created = new ValueStore(0);
  values.set(name, created);
  return created;
}

const Consumer = memo(function Consumer({ store }: { readonly store: ValueStore<number> }) {
  useValue(store);
  noteConsumerRender();
  return null;
});

function Section({
  route,
}: {
  readonly route: { readonly name: string; readonly key: string };
}): ReactNode {
  renderedKeys.add(route.key);
  useEffect(() => {
    woken.add(route.key);
    live.set(route.name, (live.get(route.name) ?? 0) + 1);
    mounts.set(route.name, (mounts.get(route.name) ?? 0) + 1);
    return (): void => {
      live.set(route.name, (live.get(route.name) ?? 1) - 1);
    };
  }, [route.name, route.key]);
  const store = valuesOf(route.name);
  return createElement(
    Fragment,
    null,
    ...Array.from({ length: CONSUMERS }, (_unused, index) =>
      createElement(Consumer, { key: index, store }),
    ),
  );
}

const sectionRouter: RouterFactory<
  TabNavigationState<ParamListBase>,
  NavigationAction,
  TabRouterOptions
> = (options) => {
  const real = TabRouter(options);
  return {
    type: real.type,
    getInitialState: (config) => real.getInitialState(config),
    getRehydratedState: (partial, config) => real.getRehydratedState(partial, config),
    getStateForRouteNamesChange: (state, config) => real.getStateForRouteNamesChange(state, config),
    getStateForRouteFocus: (state, key) => real.getStateForRouteFocus(state, key),
    getStateForAction: (state, action, config) => reduce(real, state, action, config),
    shouldActionChangeFocus: (action) => action.type === 'NAVIGATE',
  };
};

const shown = new Set<string>();

function SectionsLike({ children }: { readonly children?: ReactNode }): ReactNode {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(
    sectionRouter,
    {
      children,
      screenLayout: screenPause,
      backBehavior: 'initialRoute',
      initialRouteName: 'index',
    },
  );
  useSectionPrewarm({ state, navigation });
  const current = state.routes[state.index];
  if (current !== undefined) shown.add(current.key);
  const rendered = state.routes.filter(
    (route) => shown.has(route.key) || state.preloadedRouteKeys.includes(route.key),
  );
  return createElement(
    NavigationContent,
    null,
    ...rendered.map((route) =>
      createElement(Fragment, { key: route.key }, descriptors[route.key]?.render()),
    ),
  );
}

const container = createNavigationContainerRef();

function App(): ReactNode {
  const sections = createElement(
    SectionsLike,
    null,
    ...SECTIONS.map((name) => createElement(Screen, { key: name, name, component: Section })),
  );
  const navigation = { ref: container, children: sections };
  return createElement(BaseNavigationContainer, navigation);
}

function SecondApp(): ReactNode {
  const sections = createElement(
    SectionsLike,
    null,
    ...SECTIONS.map((name) => createElement(Screen, { key: name, name, component: Section })),
  );
  const navigation = { children: sections };
  return createElement(BaseNavigationContainer, navigation);
}

function open(name: string): void {
  act(() => {
    container.dispatch({ type: 'NAVIGATE', payload: { name } });
  });
}

function nextFrame(): void {
  act(() => {
    const due = frames;
    frames = [];
    for (const frame of due) frame();
  });
}

function nextIdle(): boolean {
  const due = idle;
  idle = [];
  act(() => {
    for (const callback of due) callback();
  });
  nextFrame();
  return due.length > 0;
}

function warmAll(): number {
  let stages = 0;
  while (nextIdle()) stages += 1;
  return stages;
}

const total = (counts: Map<string, number>): number =>
  [...counts.values()].reduce((sum, count) => sum + count, 0);

beforeEach(() => {
  live.clear();
  renderedKeys.clear();
  woken.clear();
  mounts.clear();
  values.clear();
  shown.clear();
  consumerRenders = 0;
  frames = [];
  idle = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('requestIdleCallback', (callback: () => void): number => idle.push(callback));
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(App));
  });
});

afterEach(() => {
  nextFrame();
  vi.unstubAllGlobals();
});

describe('fitness sections', () => {
  it('prewarm one stage per idle callback: mount hidden, then wake, for every section', () => {
    expect(total(live)).toBe(1);
    expect(nextIdle()).toBe(true);
    expect(live.get('activity') ?? 0).toBe(0);
    expect(nextIdle()).toBe(true);
    expect(live.get('activity')).toBe(1);
    expect(warmAll()).toBe(4);
    expect(total(live)).toBe(SECTIONS.length);
  });

  it('switch between warmed sections without mounting anything or rendering a consumer', () => {
    warmAll();
    consumerRenders = 0;
    for (const name of ['activity', 'nutrition', 'index', 'heart', 'activity']) open(name);
    expect(consumerRenders).toBe(0);
    expect(Object.fromEntries(mounts)).toEqual({ index: 1, activity: 1, nutrition: 1, heart: 1 });
  });

  it('keep a section opened before its prewarm mounted, and render only what changed on return', () => {
    open('heart');
    open('index');
    act(() => {
      valuesOf('heart').set(1);
    });
    consumerRenders = 0;
    open('heart');
    expect(consumerRenders).toBe(0);
    nextFrame();
    expect(consumerRenders).toBe(CONSUMERS);
    expect(mounts.get('heart')).toBe(1);
  });

  it('go back from a section to the first one', () => {
    open('nutrition');
    act(() => {
      container.dispatch({ type: 'GO_BACK' });
    });
    expect(container.getRootState().routes[container.getRootState().index]?.name).toBe('index');
  });

  it('start only one prewarm stage per idle window across navigators', () => {
    const second = createRoot({
      nodeType: 1,
      tagName: 'DIV',
      ownerDocument: null,
      addEventListener: (): void => undefined,
    });
    act(() => {
      second.render(createElement(SecondApp));
    });
    const started = (): number => renderedKeys.size + woken.size;
    for (let batch = 0; batch < 20; batch += 1) {
      const before = started();
      if (!nextIdle()) break;
      expect(started() - before).toBeLessThanOrEqual(1);
    }
    expect(total(live)).toBe(SECTIONS.length * 2);
  });
});
