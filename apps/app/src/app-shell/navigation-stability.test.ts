import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LIVE_CHANGE, type LiveChange } from '@smarteverything/domain';
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
import { EntityStore } from '../store/entity-store';
import { StoreProvider } from '../store/store-context';
import { CommandLedger } from '../store/command-ledger';
import { useLoaded, useSyncStatus } from '../store/selectors';
import { screenPause } from './screen-pause';

const NOTICES = 500;
const DEVICE = '00000000-0000-4000-8000-000000000001';
const TAB_NAMES = ['home', 'devices', 'cameras'] as const;

const renders = { tabs: 0, stacks: 0, screens: 0, gates: 0 };

function useCount(name: keyof typeof renders): void {
  useEffect(() => {
    renders[name] += 1;
  });
}

function changeAt(seq: number): LiveChange {
  return LIVE_CHANGE.parse({
    type: 'change',
    table: 'device_state',
    operation: 'UPDATE',
    seq,
    record: {
      device_id: DEVICE,
      capability: 'level',
      value: seq,
      observed_at: new Date(Date.UTC(2026, 9, 16, 0, 0, seq % 60)).toISOString(),
    },
    oldRecord: null,
  });
}

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

function LeafScreen(): ReactNode {
  useCount('screens');
  return null;
}

function GateLike(): ReactNode {
  useCount('gates');
  useLoaded();
  useSyncStatus();
  return null;
}

function StackNavigator({ children }: { readonly children?: ReactNode }): ReactNode {
  useCount('stacks');
  const { state, descriptors, NavigationContent } = useNavigationBuilder(STACK, {
    children,
    screenLayout: screenPause,
  });
  return createElement(
    NavigationContent,
    null,
    ...state.routes.map((route) => descriptors[route.key]?.render()),
  );
}

function TabStackLike(): ReactNode {
  return createElement(
    StackNavigator,
    null,
    createElement(Screen, { name: 'index', component: LeafScreen }),
  );
}

function TabsNavigator({ children }: { readonly children?: ReactNode }): ReactNode {
  useCount('tabs');
  const { state, descriptors, NavigationContent } = useNavigationBuilder(TABS, {
    children,
    screenLayout: screenPause,
  });
  return createElement(
    NavigationContent,
    null,
    ...state.routes.map((route) => descriptors[route.key]?.render()),
  );
}

const container = createNavigationContainerRef();

function Screens(): ReactNode {
  return createElement(
    TabsNavigator,
    null,
    ...TAB_NAMES.map((name) => createElement(Screen, { key: name, name, component: TabStackLike })),
  );
}

function App({ store }: { readonly store: EntityStore }): ReactNode {
  const runtime = { store, ledger: new CommandLedger(store) };
  const navigation = { ref: container, children: createElement(Screens) };
  const providers = {
    runtime,
    children: [
      createElement(GateLike, { key: 'gate' }),
      createElement(BaseNavigationContainer, { key: 'navigation', ...navigation }),
    ],
  };
  return createElement(StoreProvider, providers);
}

let frames: (() => void)[] = [];

function flushFrames(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

function sendNotices(store: EntityStore): void {
  for (let seq = 1; seq <= NOTICES; seq += 1) {
    act(() => {
      if (seq % 3 === 0) store.apply([changeAt(seq)]);
      else if (seq % 3 === 1) store.setSync({ status: 'live', problem: null });
      else store.appendLog([`line ${String(seq)}`]);
      flushFrames();
    });
  }
}

function switchTabs(): void {
  for (const name of TAB_NAMES) {
    act(() => {
      container.dispatch({ type: 'NAVIGATE', payload: { name } });
    });
  }
}

beforeEach(() => {
  frames = [];
  Object.assign(renders, { tabs: 0, stacks: 0, screens: 0, gates: 0 });
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

function mount(store: EntityStore): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(App, { store }));
  });
}

describe('navigator tree under live notices', () => {
  it('renders no navigator or screen for 500 store notices', () => {
    const store = new EntityStore();
    store.update((state) => ({ ...state, loaded: true }));
    store.setSync({ status: 'live', problem: null });
    mount(store);
    const mounted = { ...renders };
    expect(mounted.tabs).toBe(1);

    sendNotices(store);

    expect(renders.tabs).toBe(mounted.tabs);
    expect(renders.stacks).toBe(mounted.stacks);
    expect(renders.screens).toBe(mounted.screens);
    expect(renders.gates).toBe(mounted.gates);
  });

  it('keeps the work of a tab switch bounded and leaves it flat afterwards', () => {
    const store = new EntityStore();
    store.update((state) => ({ ...state, loaded: true }));
    mount(store);
    const before = { ...renders };

    switchTabs();

    const perSwitch = (renders.tabs - before.tabs) / TAB_NAMES.length;
    expect(perSwitch).toBeLessThanOrEqual(2);
    const afterSwitch = { ...renders };
    sendNotices(store);
    expect(renders.tabs).toBe(afterSwitch.tabs);
    expect(renders.screens).toBe(afterSwitch.screens);
  });
});
