import { useEffect } from 'react';
import { useNavigationContainerRef } from 'expo-router';
import {
  CommonActions,
  type NavigationAction,
  type NavigationState,
} from 'expo-router/react-navigation';
import {
  CLEAR_REPLACEMENT,
  REMOVE_REPLACEMENT,
  REPLACEMENT_COMPLETE,
  completionIn,
  requestIn,
  sourceIsCurrent,
  stateIn,
  tabIsCurrent,
  type ReplacementRequest,
  type RouterState,
} from './tab-replacement';

interface ReplacementNavigation {
  readonly dispatch: (action: NavigationAction) => void;
}

class ReplacementResetError extends Error {
  override readonly name = 'ReplacementResetError';

  constructor(readonly stateKey: string) {
    super(`The replacement reset for ${stateKey} has no source state.`);
  }
}

function resetAction(state: NavigationState): NavigationAction {
  const action = CommonActions.reset(state);
  if (action.payload === undefined) throw new ReplacementResetError(state.key);
  return { ...action, payload: action.payload, target: state.key };
}

function advance(request: ReplacementRequest, type: string): NavigationAction {
  return { type, target: request.destination.target, payload: { id: request.id } };
}

function removeSource(
  navigation: ReplacementNavigation,
  state: RouterState,
  request: ReplacementRequest,
): void {
  const source = stateIn(state, request.sourceStateKey);
  if (source === null || !sourceIsCurrent(state, request)) {
    navigation.dispatch(advance(request, CLEAR_REPLACEMENT));
    return;
  }
  const index = source.index;
  navigation.dispatch(advance(request, REMOVE_REPLACEMENT));
  const resetState = {
    ...source,
    index: index - 1,
    routes: source.routes.slice(0, index),
    [REPLACEMENT_COMPLETE]: request,
  };
  navigation.dispatch({
    ...resetAction(resetState),
    source: request.sourceRouteKey,
  });
}

function clearCompletion(
  navigation: ReplacementNavigation,
  state: RouterState,
  request: ReplacementRequest,
): void {
  const source = stateIn(state, request.sourceStateKey);
  if (source === null) return;
  const resetState = { ...source, [REPLACEMENT_COMPLETE]: undefined };
  navigation.dispatch(resetAction(resetState));
}

function cleanSource(
  navigation: ReplacementNavigation,
  state: RouterState,
  request: ReplacementRequest,
): void {
  const reserved = new Set(['screen', 'params', 'initial', 'state']);
  let layer: RouterState | null = stateIn(state, request.destination.target);
  while (layer !== null) {
    const route: RouterState['routes'][number] | undefined = layer.routes[layer.index ?? 0];
    if (route === undefined || layer.key === undefined) return;
    if (route.params !== undefined && route.key !== undefined) {
      const params = Object.fromEntries(
        Object.entries(route.params).filter(([key]) => !reserved.has(key)),
      );
      navigation.dispatch({
        ...CommonActions.replaceParams(params),
        target: layer.key,
        source: route.key,
      });
    }
    layer = route.state ?? null;
  }
}

function handleReplacement(navigation: ReplacementNavigation, state: RouterState): void {
  const request = requestIn(state);
  const complete = completionIn(state);
  if (complete !== null && complete.id !== request?.id) {
    clearCompletion(navigation, state, complete);
    return;
  }
  if (request === null) return;
  if (complete?.id === request.id) {
    navigation.dispatch(advance(request, CLEAR_REPLACEMENT));
    clearCompletion(navigation, state, request);
    if (!tabIsCurrent(state, request)) return;
    cleanSource(navigation, state, request);
    navigation.dispatch(request.destination);
    return;
  }
  if (!sourceIsCurrent(state, request)) {
    navigation.dispatch(advance(request, CLEAR_REPLACEMENT));
    return;
  }
  if (request.phase === 'requested') removeSource(navigation, state, request);
}

export function useTabReplacement(): void {
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    const update = (): void => {
      if (navigation.isReady()) handleReplacement(navigation, navigation.getRootState());
    };
    const unsubscribe = navigation.addListener('state', update);
    update();
    return unsubscribe;
  }, [navigation]);
}
