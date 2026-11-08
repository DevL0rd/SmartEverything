import {
  StackActions,
  type NavigationAction,
  type NavigationState,
  type PartialState,
  type RouterConfigOptions,
} from 'expo-router/react-navigation';
import { Logger } from '@smarteverything/logging';
import { prepareSettingsVisit, retainSettingsOrigin } from './settings-navigation';
import {
  CLEAR_REPLACEMENT,
  COMMIT_REPLACEMENT,
  REMOVE_REPLACEMENT,
  REPLACEMENT_REQUEST,
  replacementFor,
  replacementOf,
} from './tab-replacement';

export type TabNavigationAction = Omit<NavigationAction, 'payload'> & {
  readonly payload?: NavigationAction['payload'];
};

interface ActionRouter<State extends NavigationState, Action extends TabNavigationAction> {
  getStateForAction(
    state: State,
    action: Action,
    options: RouterConfigOptions,
  ): State | PartialState<State> | null;
}

const log = new Logger('app.nav');

export function shellTabBackBehavior(native: boolean): 'none' | 'fullHistory' {
  return native ? 'none' : 'fullHistory';
}

interface Params {
  name?: unknown;
  id?: unknown;
  screen?: unknown;
  params?: unknown;
  initial?: unknown;
}

function isParams(value: unknown): value is Params {
  return typeof value === 'object' && value !== null;
}

function nestedParamsOf(action: TabNavigationAction): Params | null {
  if (action.type !== 'NAVIGATE' && action.type !== 'JUMP_TO' && action.type !== 'REPLACE') {
    return null;
  }
  const payload: unknown = action.payload;
  return isParams(payload) && isParams(payload.params) ? payload.params : null;
}

type AnyState = NavigationState | PartialState<NavigationState>;
function replacesTab(state: NavigationState, action: TabNavigationAction): boolean {
  const payload: unknown = action.payload;
  return (
    action.type === 'REPLACE' &&
    isParams(payload) &&
    typeof payload.name === 'string' &&
    state.routeNames.includes(payload.name) &&
    payload.name !== state.routes[state.index]?.name
  );
}

function anchorChain(first: Params | null): void {
  let level: unknown = first;
  while (isParams(level) && typeof level.screen === 'string' && level.initial === undefined) {
    level.initial = false;
    level = level.params;
  }
}

function replaceHistory<State extends NavigationState>(
  previous: State,
  next: State | PartialState<State> | null,
): State | PartialState<State> | null {
  const history = previous.history;
  const appended = next?.history;
  if (next === null || history === undefined || appended?.length !== history.length + 1) {
    return next;
  }
  return { ...next, history: [...history.slice(0, -1), ...appended.slice(-1)] };
}

function navigateTab<State extends NavigationState, Action extends TabNavigationAction>(
  original: ActionRouter<State, Action>,
  state: State,
  action: Action,
  options: RouterConfigOptions,
): State | PartialState<State> | null {
  const commit = action.type === COMMIT_REPLACEMENT;
  const navigation = commit ? { ...action, type: 'JUMP_TO' } : action;
  const visit = prepareSettingsVisit(state, navigation);
  anchorChain(nestedParamsOf(navigation));
  const next = original.getStateForAction(visit, navigation, options);
  const replaced = commit ? replaceHistory(state, next) : next;
  return replaced === next ? retainSettingsOrigin(state, navigation, next) : replaced;
}

export function anchorTabRoots<State extends NavigationState, Action extends TabNavigationAction>(
  original: ActionRouter<State, Action>,
): Partial<ActionRouter<State, Action>> {
  return {
    getStateForAction: (
      state,
      action,
      options,
    ): ReturnType<ActionRouter<State, Action>['getStateForAction']> => {
      const request = replacementOf(Reflect.get(state, REPLACEMENT_REQUEST));
      const payload: unknown = action.payload;
      if (request !== null && isParams(payload) && payload.id === request.id) {
        if (action.type === CLEAR_REPLACEMENT) {
          return { ...state, [REPLACEMENT_REQUEST]: undefined };
        }
        if (action.type === REMOVE_REPLACEMENT) {
          return { ...state, [REPLACEMENT_REQUEST]: { ...request, phase: 'removing' } };
        }
      }
      if (replacesTab(state, action)) {
        const replacement = replacementFor(state, action);
        log.debug('tab.replace_requested', () => ({
          tab: isParams(payload) && typeof payload.name === 'string' ? payload.name : null,
          replacement: replacement !== null,
        }));
        return replacement === null
          ? replaceHistory(
              state,
              original.getStateForAction(state, { ...action, type: 'JUMP_TO' }, options),
            )
          : { ...state, [REPLACEMENT_REQUEST]: replacement };
      }
      return navigateTab(original, state, action, options);
    },
  };
}

type LevelState = AnyState & { readonly routes: readonly LevelRoute[] };
interface LevelRoute {
  readonly key?: string | undefined;
  readonly name: string;
  readonly params?: object | undefined;
  readonly state?: AnyState | undefined;
}

function homeOf(state: LevelState): LevelRoute | undefined {
  return state.routes.find((route) => route.state?.type === 'tab') ?? state.routes[0];
}

function backToHome(state: LevelState, home: LevelRoute, dispatch: Dispatch): void {
  if (state.key === undefined) return;
  if (home === state.routes[0]) {
    dispatch({ ...StackActions.popToTop(), target: state.key });
    return;
  }
  dispatch({
    type: 'RESET',
    payload: { index: 0, routes: [home] },
    target: state.key,
  });
}

type Dispatch = (action: NavigationAction) => void;

export function popTabToRoot(
  tab: { readonly state?: AnyState | undefined },
  dispatch: Dispatch,
): void {
  let state = tab.state;
  while (state !== undefined) {
    const first = state.routes[0];
    const home = state.type === 'stack' ? homeOf(state) : first;
    if (state.key !== undefined && home !== undefined && (state.index ?? 0) > 0) {
      if (state.type === 'stack') {
        backToHome(state, home, dispatch);
      } else {
        dispatch({ type: 'JUMP_TO', payload: { name: home.name }, target: state.key });
      }
    }
    state = home?.state;
  }
}
