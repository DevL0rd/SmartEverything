import { act, Children, createElement, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StackRouter,
  type ParamListBase,
  type StackNavigationState,
} from '../../../../node_modules/expo-router/build/react-navigation/routers';
import { leafRoutesOf, singularIdOf } from './pin-routes';

interface Captured {
  readonly initialRouteName: string | undefined;
  readonly declared: readonly string[];
}

let group = '(home)';
const renders: Captured[] = [];

function ScreenMarker(): ReactNode {
  return null;
}

function nameOf(child: unknown): readonly string[] {
  if (!isValidElement(child)) return [];
  const props: unknown = child.props;
  const name: unknown =
    typeof props === 'object' && props !== null ? Reflect.get(props, 'name') : undefined;
  return typeof name === 'string' ? [name] : [];
}

vi.mock('expo-router', () => ({
  useIsFocused: (): boolean => true,
  useRoute: (): { readonly key: string; readonly name: string } => ({
    key: `${group}-key`,
    name: group,
  }),
  Stack: Object.assign(
    function StackProbe({
      initialRouteName,
      children,
    }: {
      readonly initialRouteName?: string;
      readonly children?: ReactNode;
    }): ReactNode {
      renders.push({ initialRouteName, declared: Children.toArray(children).flatMap(nameOf) });
      return null;
    },
    { Screen: ScreenMarker },
  ),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('./instant-open', () => ({
  forgetRoute: (): void => undefined,
  isInstantRoute: (): boolean => false,
}));
vi.mock('./nav-model', () => ({ tabOfRouteName: (): null => null }));
vi.mock('./screen-pause', () => ({ screenPause: (): null => null }));
vi.mock('./preloader', () => ({ preloader: { boostSection: (): void => undefined } }));

const { TabStack } = await import('./tab-stack');

const HOSTS: readonly { readonly group: string; readonly initial: string }[] = [
  { group: '(home)', initial: 'index' },
  { group: '(cameras)', initial: 'cameras/index' },
  { group: '(devices)', initial: 'devices/index' },
  { group: '(automations)', initial: 'automations' },
];

function stackOf(host: (typeof HOSTS)[number]): Captured {
  group = host.group;
  renders.length = 0;
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(TabStack, { initialRouteName: host.initial }));
  });
  act(() => {
    root.unmount();
  });
  const rendered = renders[renders.length - 1];
  if (rendered === undefined) throw new Error(`The ${host.group} stack did not render.`);
  return rendered;
}

function expoRouterOrder(host: (typeof HOSTS)[number], declared: readonly string[]): string[] {
  const leaves = leafRoutesOf(host.group).map((leaf) => leaf.route);
  const rest = [host.initial, ...leaves].filter((name) => !declared.includes(name));
  return [...declared, ...rest];
}

type HomeState = StackNavigationState<ParamListBase>;

function homeRouter(): {
  readonly router: ReturnType<typeof StackRouter>;
  readonly options: Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[2];
} {
  const leaves = leafRoutesOf('(home)').filter((leaf) => leaf.keys.length > 0);
  const routeNames = expoRouterOrder(
    { group: '(home)', initial: 'index' },
    leaves.map((leaf) => leaf.route),
  );
  const routeGetIdList = Object.fromEntries(
    leaves.map((leaf) => {
      const id = singularIdOf(leaf);
      return [
        leaf.route,
        ({ params }: { readonly params?: object | undefined }): string | undefined =>
          id(leaf.route, params === undefined ? {} : { ...params }),
      ];
    }),
  );
  return {
    router: StackRouter({ initialRouteName: 'index' }),
    options: { routeNames, routeParamList: {}, routeGetIdList },
  };
}

function step(
  kit: ReturnType<typeof homeRouter>,
  state: HomeState,
  action: Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[1],
): HomeState {
  const next = kit.router.getStateForAction(state, action, kit.options);
  if (next?.stale !== false) return state;
  return next;
}

function assertSound(state: HomeState): void {
  const keys = [...state.routes, ...state.preloadedRoutes].map((route) => route.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(state.routes[0]?.name).toBe('index');
  const focused = state.routes[state.index];
  expect(state.preloadedRoutes.some((route) => route.key === focused?.key)).toBe(false);
}

const ROOM_A = { roomId: 'room-a' };
const ROOM_B = { roomId: 'room-b' };
const GATES = { groupId: 'gates' };
const DEVICE = { deviceId: 'device-d' };

function preload(
  name: string,
  params: object,
): { readonly type: 'PRELOAD'; readonly payload: { name: string; params: object } } {
  return { type: 'PRELOAD', payload: { name, params } };
}

function open(
  name: string,
  params: object,
): { readonly type: 'NAVIGATE'; readonly payload: { name: string; params: object } } {
  return { type: 'NAVIGATE', payload: { name, params } };
}

const BACK = { type: 'GO_BACK' } as const;

function warmed(kit: ReturnType<typeof homeRouter>): HomeState {
  let state = kit.router.getInitialState(kit.options);
  for (const [name, params] of [
    ['rooms/[roomId]/index', ROOM_A],
    ['rooms/[roomId]/index', ROOM_B],
    ['groups/[groupId]', GATES],
    ['device/[deviceId]/index', DEVICE],
  ] as const) {
    state = step(kit, state, preload(name, params));
  }
  return state;
}

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

describe('tab stack initial route', () => {
  it.each(HOSTS)(
    'starts the $group stack on its own index even though pin routes are declared first',
    (host) => {
      const stack = stackOf(host);
      const routeNames = expoRouterOrder(host, stack.declared);
      const initial = StackRouter({
        ...(stack.initialRouteName === undefined
          ? {}
          : { initialRouteName: stack.initialRouteName }),
      }).getInitialState({ routeNames, routeParamList: {}, routeGetIdList: {} });
      expect(initial.routes.map((route) => route.name)).toEqual([host.initial]);
    },
  );

  it('declares the pinned camera route ahead of the cameras index, which is why the index is passed', () => {
    const stack = stackOf({ group: '(cameras)', initial: 'cameras/index' });
    expect(stack.declared[0]).toBe('cameras/[cameraId]/index');
    expect(stack.initialRouteName).toBe('cameras/index');
  });
});

describe('home stack with warmed pins', () => {
  it('keeps home underneath and never focuses a warmed pin while opening and going back', () => {
    const kit = homeRouter();
    let state = warmed(kit);
    assertSound(state);
    expect(state.routes.map((route) => route.name)).toEqual(['index']);
    const sequence = [
      open('rooms/[roomId]/index', ROOM_A),
      BACK,
      open('groups/[groupId]', GATES),
      BACK,
      open('rooms/[roomId]/index', ROOM_A),
      open('rooms/[roomId]/index', ROOM_B),
      open('device/[deviceId]/index', DEVICE),
      open('rooms/[roomId]/index', ROOM_A),
      BACK,
      BACK,
      BACK,
      BACK,
    ];
    for (const action of sequence) {
      state = step(kit, state, action);
      assertSound(state);
    }
    expect(state.routes.map((route) => route.name)).toEqual(['index']);
    expect(state.index).toBe(0);
  });

  it('opens the same pinned page once instead of stacking it', () => {
    const kit = homeRouter();
    let state = warmed(kit);
    state = step(kit, state, open('rooms/[roomId]/index', ROOM_A));
    state = step(kit, state, open('rooms/[roomId]/index', ROOM_A));
    assertSound(state);
    expect(state.routes.map((route) => route.name)).toEqual(['index', 'rooms/[roomId]/index']);
  });
});
