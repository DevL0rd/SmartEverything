import { API_ENDPOINTS as E, type NativeHubRouteSnapshot } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../format/errors';

const log = new Logger('app.hub-route');

function routeContext(state: NativeHubRouteSnapshot | null): string {
  if (state === null) return 'unconfigured';
  const kind = state.readiness === 'ready' ? state.endpoint.kind : 'none';
  return `${state.readiness}/${kind}/r${String(state.routeGeneration)}/n${String(state.networkGeneration)}`;
}

export function noteNativeRouteChange(
  previous: NativeHubRouteSnapshot | null,
  current: NativeHubRouteSnapshot,
): void {
  if (
    previous?.readiness !== 'ready' ||
    (current.readiness === 'ready' && current.routeGeneration === previous.routeGeneration)
  )
    return;
  log.warn('route.lease_withdrawn', {
    reason: `Native route ${routeContext(previous)} → ${routeContext(current)}; ${current.detail}`,
  });
}

interface RequestFailure {
  readonly error: unknown;
  readonly url: string;
  readonly method: string;
  readonly elapsedMs: number;
  readonly started: NativeHubRouteSnapshot;
  readonly current: NativeHubRouteSnapshot | null;
}

export function noteNativeRequestFailure(failure: RequestFailure): void {
  const path = new URL(failure.url).pathname;
  if (path === E.reportClientFailures.path) return;
  const route = path.split('/').slice(0, 3).join('/');
  log.warn('route.request_failed', {
    reason: `Native ${failure.method} ${route} failed after ${String(failure.elapsedMs)}ms; start=${routeContext(failure.started)} current=${routeContext(failure.current)}; ${rawErrorText(failure.error)}`,
  });
}
