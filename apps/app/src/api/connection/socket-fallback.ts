const FAILURES_BEFORE_SWITCH = 2;

export type SocketRoute = 'primary' | 'fallback';

export interface SocketFallbackState {
  readonly key: string;
  readonly route: SocketRoute;
  readonly failures: number;
}

export function socketRouteFor(
  state: SocketFallbackState | null,
  key: string,
): SocketFallbackState {
  return state?.key === key ? state : { key, route: 'primary', failures: 0 };
}

export function afterSocketAttempt(
  state: SocketFallbackState,
  opened: boolean,
): SocketFallbackState {
  if (opened) return { ...state, failures: 0 };
  const failures = state.failures + 1;
  if (failures < FAILURES_BEFORE_SWITCH) return { ...state, failures };
  return { ...state, route: state.route === 'primary' ? 'fallback' : 'primary', failures: 0 };
}
