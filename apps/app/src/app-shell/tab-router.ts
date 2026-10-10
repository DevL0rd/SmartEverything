import {
  StackActions,
  type NavigationAction,
  type NavigationState,
  type PartialState,
  type Router,
} from 'expo-router/react-navigation';

interface Params {
  screen?: unknown;
  params?: unknown;
  initial?: unknown;
}

function isParams(value: unknown): value is Params {
  return typeof value === 'object' && value !== null;
}

function nestedParamsOf(action: NavigationAction): Params | null {
  if (action.type !== 'NAVIGATE' && action.type !== 'JUMP_TO') {
    return null;
  }
  const payload: unknown = action.payload;
  return isParams(payload) && isParams(payload.params) ? payload.params : null;
}

function anchorChain(first: Params | null): void {
  let level: unknown = first;
  while (isParams(level) && typeof level.screen === 'string' && level.initial === undefined) {
    level.initial = false;
    level = level.params;
  }
}

export function anchorTabRoots<State extends NavigationState, Action extends NavigationAction>(
  original: Router<State, Action>,
): Partial<Router<State, Action>> {
  return {
    getStateForAction: (
      state,
      action,
      options,
    ): ReturnType<Router<State, Action>['getStateForAction']> => {
      anchorChain(nestedParamsOf(action));
      return original.getStateForAction(state, action, options);
    },
  };
}

type AnyState = NavigationState | PartialState<NavigationState>;

export function popTabToRoot(
  tab: { readonly state?: AnyState | undefined },
  dispatch: (action: NavigationAction) => void,
): void {
  let state = tab.state;
  while (state !== undefined) {
    if (state.type === 'stack' && state.key !== undefined && (state.index ?? 0) > 0) {
      dispatch({ ...StackActions.popToTop(), target: state.key });
    }
    state = state.routes[state.index ?? 0]?.state;
  }
}
