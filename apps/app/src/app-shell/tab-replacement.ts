import { randomUUID } from 'expo-crypto';
import {
  type NavigationAction,
  type NavigationState,
  type PartialState,
} from 'expo-router/react-navigation';
import { z } from 'zod';

export type RouterState = NavigationState | PartialState<NavigationState>;

export const REPLACEMENT_REQUEST = '__tabReplacementRequest';
export const REPLACEMENT_COMPLETE = '__tabReplacementComplete';
export const REMOVE_REPLACEMENT = 'TAB_REPLACEMENT_REMOVE';
export const CLEAR_REPLACEMENT = 'TAB_REPLACEMENT_CLEAR';

const REQUEST = z.object({
  id: z.string(),
  phase: z.enum(['requested', 'removing']),
  sourceTabKey: z.string(),
  sourceStateKey: z.string(),
  sourceRouteKey: z.string(),
  destination: z.object({
    type: z.literal('JUMP_TO'),
    target: z.string(),
    payload: z.object({ name: z.string(), params: z.unknown().optional() }).loose(),
  }),
});

export type ReplacementRequest = z.infer<typeof REQUEST>;

export function replacementOf(value: unknown): ReplacementRequest | null {
  return REQUEST.safeParse(value).data ?? null;
}

export function requestIn(state: RouterState): ReplacementRequest | null {
  const request = replacementOf(Reflect.get(state, REPLACEMENT_REQUEST));
  if (request !== null) return request;
  for (const route of state.routes) {
    if (route.state === undefined) continue;
    const nested = requestIn(route.state);
    if (nested !== null) return nested;
  }
  return null;
}

export function stateIn(state: RouterState, key: string): NavigationState | null {
  if (state.key === key) return state.stale === false ? state : null;
  for (const route of state.routes) {
    if (route.state === undefined) continue;
    const nested = stateIn(route.state, key);
    if (nested !== null) return nested;
  }
  return null;
}

function removableStack(state: RouterState | undefined): RouterState | null {
  if (state === undefined) return null;
  const nested = removableStack(state.routes[state.index ?? 0]?.state);
  if (nested !== null) return nested;
  return state.type === 'stack' && (state.index ?? 0) > 0 ? state : null;
}

export function replacementFor(
  state: NavigationState,
  action: NavigationAction,
): ReplacementRequest | null {
  const payload = z.object({ name: z.string(), params: z.unknown().optional() }).loose();
  const parsed = payload.safeParse(action.payload);
  const tab = state.routes[state.index];
  if (!parsed.success || tab === undefined) return null;
  const source = removableStack(tab.state);
  const sourceRoute = source?.routes[source.index ?? 0];
  if (source?.key === undefined || sourceRoute?.key === undefined) return null;
  return {
    id: randomUUID(),
    phase: 'requested',
    sourceTabKey: tab.key,
    sourceStateKey: source.key,
    sourceRouteKey: sourceRoute.key,
    destination: { type: 'JUMP_TO', target: state.key, payload: parsed.data },
  };
}

export function tabIsCurrent(state: RouterState, request: ReplacementRequest): boolean {
  const tabs = stateIn(state, request.destination.target);
  return tabs?.routes[tabs.index]?.key === request.sourceTabKey;
}

export function sourceIsCurrent(state: RouterState, request: ReplacementRequest): boolean {
  const source = stateIn(state, request.sourceStateKey);
  return (
    tabIsCurrent(state, request) && source?.routes[source.index]?.key === request.sourceRouteKey
  );
}

export function completionIn(state: RouterState): ReplacementRequest | null {
  const complete = replacementOf(Reflect.get(state, REPLACEMENT_COMPLETE));
  if (complete !== null) return complete;
  for (const route of state.routes) {
    if (route.state === undefined) continue;
    const nested = completionIn(route.state);
    if (nested !== null) return nested;
  }
  return null;
}

interface RemovalNavigation {
  readonly getState: () => NavigationState | undefined;
  readonly getParent: () => RemovalNavigation | undefined;
  readonly dispatch: (action: NavigationAction) => void;
}

function requestInRemoval(action: NavigationAction): ReplacementRequest | null {
  const payload: unknown = action.payload;
  if (action.type !== 'RESET' || typeof payload !== 'object' || payload === null) return null;
  return replacementOf(Reflect.get(payload, REPLACEMENT_COMPLETE));
}

function rootOf(navigation: RemovalNavigation): RemovalNavigation {
  let root = navigation;
  let parent = root.getParent();
  while (parent !== undefined) {
    root = parent;
    parent = root.getParent();
  }
  return root;
}

export function resumeGuardedRemoval(
  navigation: RemovalNavigation,
  action: NavigationAction,
  accepted: boolean,
): void {
  const marked = requestInRemoval(action);
  if (marked !== null) {
    const root = rootOf(navigation);
    const state = root.getState();
    if (state === undefined || requestIn(state)?.id !== marked.id) return;
    if (!accepted) {
      root.dispatch({
        type: CLEAR_REPLACEMENT,
        target: marked.destination.target,
        payload: { id: marked.id },
      });
      return;
    }
    if (!sourceIsCurrent(state, marked)) return;
  }
  if (accepted) navigation.dispatch(action);
}
