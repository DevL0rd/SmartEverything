import { act, createElement, Fragment, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BaseNavigationContainer,
  createNavigationContainerRef,
  useNavigationBuilder,
} from '../../../../node_modules/expo-router/build/react-navigation/core';
import { Screen } from '../../../../node_modules/expo-router/build/react-navigation/core/Screen';
import {
  StackRouter,
  TabRouter,
  type NavigationAction,
  type ParamListBase,
  type RouterFactory,
  type StackNavigationState,
  type StackRouterOptions,
  type TabNavigationState,
  type TabRouterOptions,
} from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { pinLeafOf, type PinLeaf } from './pin-leaves';
import { noteLeafOpened, PINNED_WARM_CAP } from './pin-prewarm';
import { reduce } from './router-kit.test-util';
import { screenPause } from './screen-pause';
import { TabGroupContext } from './tab-group';
import { useTabPrewarm } from './tab-prewarm';

const GROUP = '(home)';
const DEVICE_ROUTE = 'device/[deviceId]/index';
const IDLE_ROUNDS = 80;

const mounted = new Map<string, number>();
const pausedAtMount = new Map<string, boolean>();
let frames: (() => void)[] = [];
let idle: (() => void)[] = [];
let leaves: readonly PinLeaf[] = [];

function leaf(index: number): PinLeaf {
  const deviceId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  const made = pinLeafOf({ kind: 'device', deviceId, focus: null });
  if (made === null) throw new Error('A device pin must have a leaf.');
  return made;
}

function leavesOf(count: number): readonly PinLeaf[] {
  return Array.from({ length: count }, (_unused, index) => leaf(index + 1));
}

function DeviceScreen({ route }: { readonly route: { readonly key: string } }): ReactNode {
  useEffect(() => {
    mounted.set(route.key, (mounted.get(route.key) ?? 0) + 1);
    return (): void => {
      mounted.set(route.key, (mounted.get(route.key) ?? 1) - 1);
    };
  }, [route.key]);
  return null;
}

function IndexScreen(): ReactNode {
  return null;
}

function idOfParams({ params }: { readonly params?: object | undefined }): string | undefined {
  const value: unknown = params === undefined ? undefined : Reflect.get(params, 'deviceId');
  return typeof value === 'string' ? value : undefined;
}

const stackRouter: RouterFactory<
  StackNavigationState<ParamListBase>,
  NavigationAction,
  StackRouterOptions
> = (options) => {
  const real = StackRouter(options);
  return {
    type: real.type,
    getInitialState: (config) => real.getInitialState(config),
    getRehydratedState: (partial, config) => real.getRehydratedState(partial, config),
    getStateForRouteNamesChange: (state, config) => real.getStateForRouteNamesChange(state, config),
    getStateForRouteFocus: (state, key) => real.getStateForRouteFocus(state, key),
    getStateForAction: (state, action, config) => reduce(real, state, action, config),
    shouldActionChangeFocus: (action) => real.shouldActionChangeFocus(action),
  };
};

function HomeStack(): ReactNode {
  const { state, describe, descriptors, NavigationContent } = useNavigationBuilder(stackRouter, {
    children: [
      createElement(Screen, { key: 'index', name: 'index', component: IndexScreen }),
      createElement(Screen, {
        key: DEVICE_ROUTE,
        name: DEVICE_ROUTE,
        component: DeviceScreen,
        getId: idOfParams,
      }),
    ],
    screenLayout: screenPause,
    initialRouteName: 'index',
  });
  const opened = state.routes.map((route) => descriptors[route.key]?.render());
  const warm = state.preloadedRoutes.map((route) => describe(route, true).render());
  return createElement(
    TabGroupContext,
    { value: GROUP },
    createElement(NavigationContent, null, ...opened, ...warm),
  );
}

const tabRouter: RouterFactory<
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

function Tabs({ children }: { readonly children?: ReactNode }): ReactNode {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(tabRouter, {
    children,
    screenLayout: screenPause,
    initialRouteName: GROUP,
  });
  useTabPrewarm({
    state,
    navigation,
    chatOf: () => null,
    order: [GROUP],
    pins: leaves,
  });
  const current = state.routes[state.index];
  return createElement(
    NavigationContent,
    null,
    ...state.routes
      .filter((route) => route.key === current?.key || state.preloadedRouteKeys.includes(route.key))
      .map((route) =>
        createElement(Fragment, { key: route.key }, descriptors[route.key]?.render()),
      ),
  );
}

const container = createNavigationContainerRef();

function App(): ReactNode {
  const tabs = createElement(
    Tabs,
    null,
    createElement(Screen, { key: GROUP, name: GROUP, component: HomeStack }),
  );
  const navigation = { ref: container, children: tabs };
  return createElement(BaseNavigationContainer, navigation);
}

let root: ReturnType<typeof createRoot> | null = null;

function render(): void {
  const mountedRoot = root;
  act(() => {
    mountedRoot?.render(createElement(App));
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

function warmAll(): void {
  for (let round = 0; round < IDLE_ROUNDS && nextIdle(); round += 1);
}

function stackState(): {
  readonly routes: readonly { readonly name: string; readonly params?: object | undefined }[];
  readonly preloadedRoutes: readonly {
    readonly key: string;
    readonly params?: object | undefined;
  }[];
} {
  const state = container.getRootState().routes[0]?.state;
  if (
    state === undefined ||
    !('preloadedRoutes' in state) ||
    !Array.isArray(state.preloadedRoutes)
  ) {
    throw new Error('The home stack has not mounted.');
  }
  return { routes: state.routes, preloadedRoutes: state.preloadedRoutes };
}

function deviceIdOf(route: { readonly params?: object | undefined }): unknown {
  const id: unknown = Reflect.get(route.params ?? {}, 'deviceId');
  return id;
}

function preloadedIds(): readonly unknown[] {
  return stackState().preloadedRoutes.map(deviceIdOf).sort();
}

function liveScreens(): number {
  return [...mounted.values()].reduce((sum, count) => sum + count, 0);
}

beforeEach(() => {
  mounted.clear();
  pausedAtMount.clear();
  frames = [];
  idle = [];
  leaves = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => frames.push(callback));
  vi.stubGlobal('requestIdleCallback', (callback: () => void): number => idle.push(callback));
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
});

afterEach(async () => {
  nextFrame();
  const mountedRoot = root;
  await act(async () => {
    mountedRoot?.unmount();
    await new Promise<void>((done) => {
      setImmediate(done);
    });
  });
  vi.unstubAllGlobals();
});

describe('pinned pages in the preload system', () => {
  it('warm every pin of the layout, one stage per idle window, none on screen', () => {
    leaves = leavesOf(4);
    render();
    expect(stackState().preloadedRoutes).toHaveLength(0);
    expect(nextIdle()).toBe(true);
    expect(stackState().preloadedRoutes).toHaveLength(1);
    expect(liveScreens()).toBe(0);
    expect(nextIdle()).toBe(true);
    expect(liveScreens()).toBe(1);
    warmAll();
    expect(stackState().preloadedRoutes).toHaveLength(4);
    expect(liveScreens()).toBe(4);
    expect(stackState().routes.map((route) => route.name)).toEqual(['index']);
  });

  it('keep at most the cap in memory and evict the pins past it', () => {
    leaves = leavesOf(PINNED_WARM_CAP + 3);
    render();
    warmAll();
    expect(stackState().preloadedRoutes).toHaveLength(PINNED_WARM_CAP);
    expect(preloadedIds()).toEqual(
      leaves
        .slice(0, PINNED_WARM_CAP)
        .map((entry) => entry.params['deviceId'])
        .sort(),
    );
  });

  it('warm a pin added at runtime and drop one that was removed, without a reload', () => {
    leaves = leavesOf(3);
    render();
    warmAll();
    leaves = [leaf(2), leaf(3), leaf(9)];
    render();
    warmAll();
    expect(preloadedIds()).toEqual(
      [leaf(2), leaf(3), leaf(9)].map((entry) => entry.params['deviceId']).sort(),
    );
    expect(liveScreens()).toBe(3);
  });

  it('promote the page that was opened last past the cap, evicting the least recently used', () => {
    leaves = leavesOf(PINNED_WARM_CAP + 1);
    render();
    warmAll();
    const late = leaves[PINNED_WARM_CAP];
    if (late === undefined) throw new Error('The last pin is missing.');
    act(() => {
      noteLeafOpened(late.id);
    });
    warmAll();
    const ids = preloadedIds();
    expect(ids).toHaveLength(PINNED_WARM_CAP);
    expect(ids).toContain(late.params['deviceId']);
    expect(ids).not.toContain(leaves[PINNED_WARM_CAP - 1]?.params['deviceId']);
  });

  it('open a warmed pin without mounting anything and warm it again after it is closed', () => {
    leaves = leavesOf(2);
    render();
    warmAll();
    const first = leaves[0];
    if (first === undefined) throw new Error('The first pin is missing.');
    const before = liveScreens();
    act(() => {
      container.dispatch({
        type: 'NAVIGATE',
        payload: { name: GROUP, params: { screen: first.route, params: first.params } },
      });
    });
    expect(liveScreens()).toBe(before);
    expect(stackState().routes.map((route) => route.name)).toEqual(['index', first.route]);
    expect(stackState().preloadedRoutes).toHaveLength(1);
    act(() => {
      container.dispatch({ type: 'GO_BACK' });
    });
    warmAll();
    expect(stackState().preloadedRoutes).toHaveLength(2);
  });
});
