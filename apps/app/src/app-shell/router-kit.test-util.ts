import type {
  NavigationAction,
  NavigationState,
  PartialState,
  RouterConfigOptions,
} from 'expo-router/react-navigation';

function isState<S extends NavigationState>(value: unknown): value is S | PartialState<S> {
  return typeof value === 'object' && value !== null && 'routes' in value;
}

export function reduce<S extends NavigationState>(
  router: { readonly getStateForAction: unknown },
  state: S,
  action: NavigationAction,
  options: RouterConfigOptions,
): S | PartialState<S> | null {
  const handler = router.getStateForAction;
  if (typeof handler !== 'function') throw new Error('The router has no getStateForAction.');
  const next: unknown = Reflect.apply(handler, router, [state, action, options]);
  if (next === null) return null;
  if (!isState<S>(next)) throw new Error('The router returned something that is not a state.');
  return next;
}
