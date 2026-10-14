import { useContext, type ReactElement } from 'react';
import { z } from 'zod';
import { ScreenPausedContext } from '../design/screen-pause';
import { probedScreen } from '../perf/screen-probe';

interface LayerState {
  readonly type: string;
  readonly index: number;
  readonly routes: readonly { readonly key: string }[];
}

interface ScreenPauseArgs {
  readonly route: { readonly key: string; readonly name: string };
  readonly options: unknown;
  readonly navigation: { readonly getState: () => LayerState };
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

function hiddenInLayer(state: LayerState, routeKey: string): boolean {
  const position = state.routes.findIndex((route) => route.key === routeKey);
  if (state.type === 'tab') {
    return position !== state.index;
  }
  return state.type === 'stack' && position < state.index;
}

function ScreenPauseLayer(args: ScreenPauseArgs): ReactElement {
  'use no memo';
  const ancestorPaused = useContext(ScreenPausedContext);
  const state = args.navigation.getState();
  assertOpaque(state, args);
  const paused = ancestorPaused || hiddenInLayer(state, args.route.key);
  return <ScreenPausedContext value={paused}>{args.children}</ScreenPausedContext>;
}

export function screenPause(args: ScreenPauseArgs): ReactElement {
  return probedScreen({ route: args.route, children: <ScreenPauseLayer {...args} /> });
}
