import { Activity, use, useLayoutEffect, useState, type ReactElement } from 'react';
import { z } from 'zod';
import { ScreenPause, ScreenPausedContext } from '../design/screen-pause';
import { probedScreen } from '../perf/screen-probe';
import { ScreenLifecycleLog, type ScreenNavigation } from './screen-log';
import { noteStackChanged, registerStack, type HeldRoute } from './stack-handles';
import { TabGroupContext } from './tab-group';
import { useTabAwake, wakeTab } from './tab-prewarm';

interface LayerRoute {
  readonly key: string;
  readonly name: string;
  readonly params?: unknown;
}

interface LayerState {
  readonly key: string;
  readonly type: string;
  readonly index: number;
  readonly routeNames: readonly string[];
  readonly routes: readonly LayerRoute[];
  readonly preloadedRoutes?: readonly LayerRoute[];
}

interface ScreenPauseArgs {
  readonly route: { readonly key: string; readonly name: string };
  readonly options: unknown;
  readonly navigation: {
    readonly getState: () => LayerState;
    readonly preload: (name: string, params: Readonly<Record<string, string>>) => void;
    readonly dispatch: (action: { readonly type: string; readonly payload: LayerState }) => void;
  } & ScreenNavigation;
  readonly children: ReactElement;
}

const PRESENTATION = z.object({ presentation: z.string().optional() });

const TRANSPARENT_PRESENTATIONS: readonly string[] = [
  'transparentModal',
  'containedTransparentModal',
];

class TransparentRouteInPausedStackError extends Error {
  override readonly name = 'TransparentRouteInPausedStackError';

  constructor(
    readonly routeName: string,
    readonly presentation: string,
  ) {
    super(
      `The route "${routeName}" uses the "${presentation}" presentation inside a stack that pauses the screens below it. That presentation keeps those screens visible, so pausing them would freeze what is on screen. Take the pause layer off this stack or the transparent presentation off this route.`,
    );
  }
}

function assertOpaque(state: LayerState, args: ScreenPauseArgs): void {
  const presentation = PRESENTATION.safeParse(args.options).data?.presentation;
  if (
    state.type === 'stack' &&
    presentation !== undefined &&
    TRANSPARENT_PRESENTATIONS.includes(presentation)
  ) {
    throw new TransparentRouteInPausedStackError(args.route.name, presentation);
  }
}

type Cover = 'shown' | 'paused' | 'frozen';

function coverIn(state: LayerState, routeKey: string, awake: boolean): Cover {
  const position = state.routes.findIndex((route) => route.key === routeKey);
  if (state.type === 'tab') {
    if (position === state.index) return 'shown';
    return awake ? 'paused' : 'frozen';
  }
  if (state.type !== 'stack') return 'shown';
  if (position < 0) return awake ? 'paused' : 'frozen';
  if (position >= state.index) return 'shown';
  return position === state.index - 1 ? 'paused' : 'frozen';
}

function paramsOf(route: LayerRoute): HeldRoute['params'] {
  const params: unknown = route.params;
  if (typeof params !== 'object' || params === null) return {};
  return Object.fromEntries(
    Object.entries(params).flatMap(([name, value]) =>
      typeof value === 'string' ? [[name, value]] : [],
    ),
  );
}

function heldOf(route: LayerRoute): HeldRoute {
  return { key: route.key, name: route.name, params: paramsOf(route) };
}

function useStackHandle(args: ScreenPauseArgs, stackKey: string | null): void {
  const group = use(TabGroupContext);
  const { navigation, route } = args;
  useLayoutEffect(() => {
    if (group === null || stackKey === null) return undefined;
    const unregister = registerStack(route.key, group, {
      key: stackKey,
      routeNames: () => navigation.getState().routes.map((entry) => entry.name),
      declares: (name) => navigation.getState().routeNames.includes(name),
      opened: () => navigation.getState().routes.map(heldOf),
      preloaded: () => (navigation.getState().preloadedRoutes ?? []).map(heldOf),
      preload: (name, params) => {
        navigation.preload(name, params);
      },
      drop: (routeKey) => {
        const state = navigation.getState();
        navigation.dispatch({
          type: 'RESET',
          payload: {
            ...state,
            preloadedRoutes: (state.preloadedRoutes ?? []).filter((held) => held.key !== routeKey),
          },
        });
      },
    });
    const unlisten = navigation.addListener('state', noteStackChanged);
    return (): void => {
      unlisten();
      unregister();
    };
  }, [group, stackKey, route.key, navigation]);
}

function ScreenPauseLayer(args: ScreenPauseArgs): ReactElement {
  'use no memo';
  const parent = use(ScreenPausedContext);
  const state = args.navigation.getState();
  assertOpaque(state, args);
  useStackHandle(args, state.type === 'stack' ? state.key : null);
  const cover = coverIn(state, args.route.key, useTabAwake(args.route.key));
  const paused = cover !== 'shown';
  const [pause] = useState(() => new ScreenPause(parent, paused));
  const tab = state.type === 'tab';
  useLayoutEffect(() => pause.attach(), [pause]);
  useLayoutEffect(() => {
    if (tab && !paused) wakeTab(args.route.key);
  }, [tab, paused, args.route.key]);
  useLayoutEffect(() => {
    pause.setOwn(paused);
  }, [pause, paused]);
  return (
    <ScreenPausedContext value={pause}>
      <ScreenLifecycleLog
        label={args.route.name}
        routeKey={args.route.key}
        navigation={args.navigation}
      />
      <Activity mode={cover === 'frozen' ? 'hidden' : 'visible'}>{args.children}</Activity>
    </ScreenPausedContext>
  );
}

export function screenPause(args: ScreenPauseArgs): ReactElement {
  return probedScreen({ route: args.route, children: <ScreenPauseLayer {...args} /> });
}
