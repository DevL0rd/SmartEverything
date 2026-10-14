import {
  StackActions,
  type NavigationAction,
  type NavigationState,
  type PartialState,
  type Router,
} from 'expo-router/react-navigation';
import { prepareSettingsVisit, retainSettingsOrigin } from './settings-navigation';
import {
  CLEAR_REPLACEMENT,
  REMOVE_REPLACEMENT,
  REPLACEMENT_REQUEST,
  replacementFor,
  replacementOf,
} from './tab-replacement';

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

function nestedParamsOf(action: NavigationAction): Params | null {
  if (action.type !== 'NAVIGATE' && action.type !== 'JUMP_TO' && action.type !== 'REPLACE') {
    return null;
  }
  const payload: unknown = action.payload;
  return isParams(payload) && isParams(payload.params) ? payload.params : null;
}

type AnyState = NavigationState | PartialState<NavigationState>;
function replacesTab(state: NavigationState, action: NavigationAction): boolean {
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

export function anchorTabRoots<State extends NavigationState, Action extends NavigationAction>(
  original: Router<State, Action>,
): Partial<Router<State, Action>> {
  return {
    getStateForAction: (
      state,
      action,
      options,
    ): ReturnType<Router<State, Action>['getStateForAction']> => {
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
        return replacement === null
          ? original.getStateForAction(state, { ...action, type: 'JUMP_TO' }, options)
          : { ...state, [REPLACEMENT_REQUEST]: replacement };
      }
      const visit = prepareSettingsVisit(state, action);
      anchorChain(nestedParamsOf(action));
      return retainSettingsOrigin(
        state,
        action,
        original.getStateForAction(visit, action, options),
      );
    },
  };
}

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
