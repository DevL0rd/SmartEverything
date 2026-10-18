import { act, createElement, Fragment, memo, use, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseNavigationContainer,
  createNavigationContainerRef,
  useNavigationBuilder,
} from '../../../../node_modules/expo-router/build/react-navigation/core';
import { Screen } from '../../../../node_modules/expo-router/build/react-navigation/core/Screen';
import type {
  DefaultRouterOptions,
  NavigationAction,
  NavigationState,
  RouterFactory,
} from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { ValueStore, useValue } from '../design/external-store';
import { ScreenPausedContext } from '../design/screen-pause';
import { screenPause } from './screen-pause';
import { stackOfGroup } from './stack-handles';
import { TabGroupContext } from './tab-group';
import { wakeTab } from './tab-prewarm';

const TAB_NAMES = ['home', 'devices', 'cameras'] as const;
const STACK_NAMES = ['index', 'detail', 'deeper'] as const;

const live = new Map<string, number>();

const pausedAtFirstRender = new Map<string, boolean>();

const CONSUMERS_PER_SCREEN = 400;

const SWITCH_BUDGET_MS = 10;

const homeValues = new Map<string, ValueStore<number>>();

let consumerRenders = 0;

let frames: (() => void)[] = [];

function noteConsumerRender(): void {
  consumerRenders += 1;
}

function valuesOf(key: string): ValueStore<number> {
  const found = homeValues.get(key);
  if (found !== undefined) return found;
  const created = new ValueStore(0);
  homeValues.set(key, created);
  return created;
}

const Consumer = memo(function Consumer({ store }: { readonly store: ValueStore<number> }) {
  useValue(store);
  noteConsumerRender();
  return null;
});

let keys = 0;

function listRouter(
  type: string,
): RouterFactory<NavigationState, NavigationAction, DefaultRouterOptions> {
  const initial = (routeNames: string[]): NavigationState => {
    keys += 1;
    return {
      stale: false,
      type,
      key: `${type}-${String(keys)}`,
      index: 0,
      routeNames,
      routes: routeNames.map((name) => ({ key: `${type}-${String(keys)}-${name}`, name })),
    };
  };
  return (): ReturnType<
    RouterFactory<NavigationState, NavigationAction, DefaultRouterOptions>
  > => ({
    type,
    getInitialState: ({ routeNames }) => initial(routeNames),
    getRehydratedState: (_state, { routeNames }) => initial(routeNames),
    getStateForRouteNamesChange: (state) => state,
    getStateForRouteFocus: (state, key) => ({
      ...state,
      index: Math.max(
        0,
        state.routes.findIndex((route) => route.key === key),
      ),
    }),
    getStateForAction: (state, action): NavigationState | null => {
      const payload: unknown = action.payload;
      const name: unknown =
        typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'name') : null;
      const index = state.routes.findIndex((route) => route.name === name);
      return action.type === 'NAVIGATE' && index >= 0 ? { ...state, index } : null;
    },
    shouldActionChangeFocus: () => false,
  });
}

const STACK = listRouter('stack');
const TABS = listRouter('tab');

function LeafScreen({ route }: { readonly route: { readonly key: string } }): ReactNode {
  const pause = use(ScreenPausedContext);
  if (!pausedAtFirstRender.has(route.key)) pausedAtFirstRender.set(route.key, pause.isPaused());
  useEffect(() => {
    live.set(route.key, (live.get(route.key) ?? 0) + 1);
    return (): void => {
      live.set(route.key, (live.get(route.key) ?? 1) - 1);
    };
  }, [route.key]);
  const store = valuesOf(route.key);
  return createElement(
    Fragment,
    null,
    ...Array.from({ length: CONSUMERS_PER_SCREEN }, (_unused, index) =>
      createElement(Consumer, { key: index, store }),
    ),
  );
}

function Navigator({
  router,
  children,
}: {
  readonly router: typeof STACK;
  readonly children?: ReactNode;
}): ReactNode {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(router, {
    children,
    screenLayout: screenPause,
  });
  return createElement(
    NavigationContent,
    null,
    ...state.routes
      .filter((_route, position) => router !== STACK || position <= state.index)
      .map((route) => descriptors[route.key]?.render()),
  );
}

function TabStackLike({ route }: { readonly route: { readonly name: string } }): ReactNode {
  return createElement(
    TabGroupContext,
    { value: route.name },
    createElement(
      Navigator,
      { router: STACK },
      ...STACK_NAMES.map((name) =>
        createElement(Screen, { key: name, name, component: LeafScreen }),
      ),
    ),
  );
}

const container = createNavigationContainerRef();

function App(): ReactNode {
  const tabs = createElement(
    Navigator,
    { router: TABS },
    ...TAB_NAMES.map((name) => createElement(Screen, { key: name, name, component: TabStackLike })),
  );
  const navigation = { ref: container, children: tabs };
  return createElement(BaseNavigationContainer, navigation);
}

function liveEffects(): number {
  let sum = 0;
  live.forEach((count) => {
    sum += count;
  });
  return sum;
}

function navigate(name: string): void {
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

function homeStackIndex(): number | undefined {
  return container.getRootState().routes[0]?.state?.index;
}

function timedNavigate(name: string): number {
  const started = performance.now();
  navigate(name);
  return performance.now() - started;
}

function homeIndexValues(): ValueStore<number> {
  const [first] = homeValues.values();
  if (first === undefined) throw new Error('The home tab has not mounted its first screen.');
  return first;
}

let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  live.clear();
  pausedAtFirstRender.clear();
  homeValues.clear();
  consumerRenders = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const mounted = root;
  act(() => {
    mounted.render(createElement(App));
  });
});

afterEach(() => {
  nextFrame();
  const mounted = root;
  act(() => {
    mounted?.unmount();
  });
  vi.unstubAllGlobals();
});

describe('screens that are not shown', () => {
  it('keep visited tabs mounted and paused, so showing one again mounts nothing', () => {
    expect(liveEffects()).toBe(1);
    navigate('devices');
    navigate('cameras');
    expect(liveEffects()).toBe(3);
    navigate('home');
    expect(liveEffects()).toBe(3);
  });

  it('freeze stack screens deeper than the one a back transition reveals', () => {
    navigate('deeper');
    expect(homeStackIndex()).toBe(2);
    expect(liveEffects()).toBe(2);
    navigate('index');
    expect(liveEffects()).toBe(1);
  });

  it('keep their stack when shown again', () => {
    navigate('detail');
    expect(homeStackIndex()).toBe(1);
    navigate('devices');
    navigate('home');
    expect(homeStackIndex()).toBe(1);
    expect(liveEffects()).toBe(3);
  });
});

describe('screens mounted ahead of their first visit', () => {
  it('see they are paused during their very first render', () => {
    const first = [...pausedAtFirstRender.entries()];
    expect(first.map(([, paused]) => paused).sort()).toEqual([false, true, true]);
  });
});

describe('switching to a tab that is already mounted', () => {
  it('re-renders no store consumer when nothing changed while it was hidden', () => {
    navigate('devices');
    consumerRenders = 0;
    navigate('home');
    nextFrame();
    expect(consumerRenders).toBe(0);
  });

  it('shows the tab as last drawn, then renders only the changed consumers once on the next frame', () => {
    navigate('devices');
    consumerRenders = 0;
    act(() => {
      homeIndexValues().set(1);
    });
    expect(consumerRenders).toBe(0);
    navigate('home');
    expect(consumerRenders).toBe(0);
    nextFrame();
    expect(consumerRenders).toBe(CONSUMERS_PER_SCREEN);
  });

  it('wakes a paused screen once, on the frame after it is shown again', () => {
    navigate('detail');
    consumerRenders = 0;
    act(() => {
      homeIndexValues().set(2);
      homeIndexValues().set(3);
    });
    expect(consumerRenders).toBe(0);
    navigate('index');
    expect(consumerRenders).toBe(0);
    nextFrame();
    expect(consumerRenders).toBe(CONSUMERS_PER_SCREEN);
  });

  it('stays within the switch budget in a Node bench', () => {
    navigate('devices');
    navigate('cameras');
    const samples = Array.from({ length: 6 }, (_unused, round) =>
      timedNavigate(TAB_NAMES[round % TAB_NAMES.length] ?? 'home'),
    ).sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length / 2)]).toBeLessThan(SWITCH_BUDGET_MS);
  });
});

describe('the stack of a tab group', () => {
  it('is reachable while any screen of the visited tab is mounted', () => {
    const stack = stackOfGroup('home');
    expect(stack?.routeNames()).toEqual([...STACK_NAMES]);
    expect(stack?.key).toBe(container.getRootState().routes[0]?.state?.key);
  });

  it('is reachable for a tab that was never shown only once the tab is awake', () => {
    expect(stackOfGroup('devices')).toBeNull();
    const devices = container.getRootState().routes[1];
    if (devices === undefined) throw new Error('The devices tab is missing.');
    act(() => {
      wakeTab(devices.key);
    });
    expect(stackOfGroup('devices')).not.toBeNull();
  });
});
