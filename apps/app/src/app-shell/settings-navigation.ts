import { randomUUID } from 'expo-crypto';
import { useRootNavigationState } from 'expo-router';
import type { NavigationAction, NavigationState, PartialState } from 'expo-router/react-navigation';
import { z } from 'zod';

type RouterState = NavigationState | PartialState<NavigationState>;

const SETTINGS_ROUTE = '(settings)';
const DESTINATION = z.object({ name: z.string() }).loose();
const HISTORY = z.array(z.object({ type: z.literal('route'), key: z.string() }));

interface NestedParams {
  readonly screen?: unknown;
  readonly params?: unknown;
  initial?: unknown;
}

function nestedParams(value: unknown): value is NestedParams {
  return typeof value === 'object' && value !== null;
}

function settingsDestination(action: NavigationAction): boolean {
  if (action.type !== 'NAVIGATE' && action.type !== 'JUMP_TO') return false;
  return DESTINATION.safeParse(action.payload).data?.name === SETTINGS_ROUTE;
}

function directDestination(action: NavigationAction): void {
  const payload: unknown = action.payload;
  let params: unknown = nestedParams(payload) ? payload.params : undefined;
  while (nestedParams(params) && typeof params.screen === 'string') {
    params.initial = true;
    params = params.params;
  }
}

export function prepareSettingsVisit<State extends NavigationState>(
  state: State,
  action: NavigationAction,
): State {
  const current = state.routes[state.index];
  if (!settingsDestination(action) || current?.name === SETTINGS_ROUTE) return state;
  directDestination(action);
  return {
    ...state,
    routes: state.routes.map((route) =>
      route.name === SETTINGS_ROUTE
        ? { ...route, key: `${SETTINGS_ROUTE}-${randomUUID()}`, state: undefined }
        : route,
    ),
  };
}

export function retainSettingsOrigin<State extends NavigationState>(
  previous: State,
  action: NavigationAction,
  next: State | PartialState<State> | null,
): State | PartialState<State> | null {
  const source = previous.routes[previous.index];
  const destination = next?.routes[next.index ?? 0];
  if (
    next === null ||
    source === undefined ||
    source.name === SETTINGS_ROUTE ||
    destination?.name !== SETTINGS_ROUTE ||
    destination.key === undefined ||
    !settingsDestination(action)
  )
    return next;
  return {
    ...next,
    history: [
      { type: 'route' as const, key: source.key },
      { type: 'route' as const, key: destination.key },
    ],
  };
}

export function hasSettingsOrigin(state: RouterState): boolean {
  const current = state.routes[state.index ?? 0];
  const history = HISTORY.safeParse(state.history).data;
  const previous = history?.at(-2);
  return (
    current?.name === SETTINGS_ROUTE &&
    previous !== undefined &&
    state.routes.some((route) => route.key === previous.key)
  );
}

function originIn(state: RouterState): boolean {
  if (hasSettingsOrigin(state)) return true;
  const active = state.routes[state.index ?? 0]?.state;
  return active === undefined ? false : originIn(active);
}

export function useSettingsOrigin(): boolean {
  return originIn(useRootNavigationState());
}
