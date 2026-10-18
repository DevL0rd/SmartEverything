import {
  API_ENDPOINTS as E,
  type NativeHubCredentialBinding,
  type NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../format/errors';
import type { HubRouteState } from './active-route';
import { failureFacts, safeText } from './request-log';

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

function kindOf(state: HubRouteState): string {
  return state.endpoint?.kind ?? 'none';
}

function problemOf(state: HubRouteState): string | null {
  return state.problem === null ? null : safeText(state.problem);
}

function sameRouteState(before: HubRouteState, after: HubRouteState): boolean {
  return (
    before.endpoint?.url === after.endpoint?.url &&
    before.generation === after.generation &&
    before.problem === after.problem &&
    (before.metadata === null) === (after.metadata === null)
  );
}

export function noteRouteStateChange(
  scopeId: string,
  before: HubRouteState,
  after: HubRouteState,
): void {
  if (sameRouteState(before, after)) return;
  log.info('route.state_changed', {
    scopeId: scopeId.slice(0, 8),
    fromKind: kindOf(before),
    toKind: kindOf(after),
    endpointChanged: before.endpoint?.url !== after.endpoint?.url,
    fromGeneration: before.generation,
    toGeneration: after.generation,
    hasMetadata: after.metadata !== null,
    problem: problemOf(after),
    previousProblem: problemOf(before),
    discoveryCandidates: after.discovery?.candidates.length ?? 0,
  });
}

export function noteNativeStateIgnored(
  scopeId: string,
  state: NativeHubRouteSnapshot,
  current: NativeHubRouteSnapshot | null,
): void {
  log.debug('route.native_state_ignored', () => ({
    scopeId: scopeId.slice(0, 8),
    reason: 'outdated',
    routeGeneration: state.routeGeneration,
    networkGeneration: state.networkGeneration,
    currentRouteGeneration: current?.routeGeneration ?? null,
    currentNetworkGeneration: current?.networkGeneration ?? null,
  }));
}

export function noteNativeStateAccepted(
  scopeId: string,
  transition: {
    readonly previous: NativeHubRouteSnapshot | null;
    readonly state: NativeHubRouteSnapshot;
    readonly changed: boolean;
    readonly listeners: number;
  },
): void {
  const { previous, state } = transition;
  const facts = {
    scopeId: scopeId.slice(0, 8),
    fromReadiness: previous?.readiness ?? 'unconfigured',
    toReadiness: state.readiness,
    kind: state.readiness === 'ready' ? state.endpoint.kind : 'none',
    fromRouteGeneration: previous?.routeGeneration ?? null,
    routeGeneration: state.routeGeneration,
    networkGeneration: state.networkGeneration,
    detail: safeText(state.detail),
    listeners: transition.listeners,
  };
  if (transition.changed) log.info('route.native_state_changed', facts);
  else log.debug('route.native_state_repeated', facts);
}

export function noteNativeConfigured(
  scopeId: string,
  facts: {
    readonly operation: number;
    readonly binding: NativeHubCredentialBinding;
    readonly endpoints: number;
    readonly state: NativeHubRouteSnapshot;
    readonly discarded: boolean;
    readonly elapsedMs: number;
  },
): void {
  log.info('route.native_configured', {
    scopeId: scopeId.slice(0, 8),
    operation: facts.operation,
    credentialGeneration: facts.binding.credentialGeneration,
    endpoints: facts.endpoints,
    readiness: facts.state.readiness,
    routeGeneration: facts.state.routeGeneration,
    networkGeneration: facts.state.networkGeneration,
    discarded: facts.discarded,
    elapsedMs: facts.elapsedMs,
  });
}

export function noteNativeWait(
  scopeId: string,
  wait: { readonly outcome: string; readonly waitedMs: number; readonly error: Error | undefined },
  current: NativeHubRouteSnapshot | null,
): void {
  const { outcome, waitedMs, error } = wait;
  const facts = {
    scopeId: scopeId.slice(0, 8),
    outcome,
    waitedMs,
    readiness: current?.readiness ?? 'unconfigured',
    routeGeneration: current?.routeGeneration ?? null,
  };
  if (error === undefined) log.debug('route.native_wait_done', facts);
  else log.warn('route.native_wait_failed', { ...facts, ...failureFacts(error) });
}

export function configureStepLogger(
  scopeId: string,
  operation: number,
  isCurrent: () => boolean,
): (step: string) => void {
  const startedAt = performance.now();
  return (step) => {
    log.debug('route.native_configure_step', () => ({
      scopeId: scopeId.slice(0, 8),
      operation,
      step,
      elapsedMs: Math.round(performance.now() - startedAt),
      current: isCurrent(),
    }));
  };
}
