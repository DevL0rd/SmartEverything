import { isIP } from 'node:net';
import {
  type HubEndpoint,
  type NativeHubRouteConfiguration,
  type NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import type { HubLease, HubLeasePort } from '@smarteverything/hub/client-network/lease';
import { HubPolicies, HubTransportError } from '@smarteverything/hub/client-network/policy';
import {
  probeNodeRoute,
  ROUTE_PROBE_TIMEOUT_MS,
} from '@smarteverything/hub/client-network/route-probes';
import { Logger } from '@smarteverything/logging';

const log = new Logger('desktop.hub-route');
const CHOOSING = 'Choosing the best route to your home.';
const UNREACHABLE = 'No enrolled hub endpoint is reachable.';

export interface RouteProbe {
  readonly endpoint: HubEndpoint;
  readonly outcome: 'pending' | 'ok' | 'failed';
}
type RouteState =
  | { readonly readiness: 'pending' | 'unavailable' }
  | { readonly readiness: 'ready'; readonly endpoint: HubEndpoint };
type Lease = HubLease & { readonly signal: AbortSignal };

class RouteScope {
  trust = new AbortController();
  probes = new AbortController();
  routeGeneration = 0;
  networkGeneration = 0;
  snapshot: NativeHubRouteSnapshot;
  private running: Promise<void> | null = null;
  private rerun = false;
  private retired = false;
  constructor(public configuration: NativeHubRouteConfiguration) {
    this.snapshot = this.describe({ readiness: 'pending' }, CHOOSING);
  }
  get endpoint(): HubEndpoint | null {
    return this.snapshot.readiness === 'ready' ? this.snapshot.endpoint : null;
  }
  async settled(): Promise<void> {
    while (this.running !== null) await this.running;
  }
  describe(state: RouteState, detail: string): NativeHubRouteSnapshot {
    return { ...this.header(), detail, ...state };
  }
  reconfigure(configuration: NativeHubRouteConfiguration, identityChanged: boolean): void {
    this.configuration = configuration;
    this.probes.abort();
    if (!identityChanged) {
      this.rebuild();
      return;
    }
    this.trust.abort(new HubTransportError('Hub identity changed'));
    this.trust = new AbortController();
    this.routeGeneration += 1;
    this.snapshot = this.describe({ readiness: 'pending' }, CHOOSING);
  }
  beginProbes(): AbortController {
    this.probes = new AbortController();
    return this.probes;
  }
  networkChanged(): void {
    this.networkGeneration += 1;
    this.rebuild();
    this.probes.abort();
  }
  retire(): void {
    this.retired = true;
    this.probes.abort();
    this.trust.abort(new HubTransportError('Client route scope withdrawn'));
  }
  acceptsFailure(routeGeneration: number | undefined): boolean {
    return (routeGeneration ?? this.routeGeneration) === this.routeGeneration;
  }
  publish(endpoint: HubEndpoint | null): boolean {
    const previous = this.snapshot;
    if (endpoint?.url !== this.endpoint?.url) this.routeGeneration += 1;
    this.snapshot =
      endpoint === null
        ? this.describe({ readiness: 'unavailable' }, UNREACHABLE)
        : this.describe({ readiness: 'ready', endpoint }, '');
    return (
      this.snapshot.readiness !== previous.readiness ||
      this.routeGeneration !== previous.routeGeneration
    );
  }
  reselect(run: () => Promise<void>): void {
    if (this.running !== null) {
      this.rerun = true;
      return;
    }
    this.running = run()
      .catch((cause: unknown): void => {
        log.error('route.select_failed', cause);
      })
      .finally((): void => {
        this.running = null;
        if (!this.rerun || this.retired) return;
        this.rerun = false;
        this.reselect(run);
      });
  }
  private header(): Omit<NativeHubRouteSnapshot, 'readiness' | 'detail'> {
    return {
      scopeId: this.configuration.trust.scopeId,
      canonicalOrigin: this.configuration.canonicalOrigin,
      hubId: this.configuration.trust.identity.id,
      routeGeneration: this.routeGeneration,
      networkGeneration: this.networkGeneration,
    };
  }
  private rebuild(): void {
    this.snapshot = { ...this.snapshot, ...this.header() };
  }
}

export function routeCandidates(
  configuration: NativeHubRouteConfiguration,
): readonly HubEndpoint[] {
  const { endpoints } = configuration.trust;
  const addresses = endpoints.filter(
    (endpoint) =>
      endpoint.kind === 'lan' && isIP(new URL(endpoint.url).hostname.replace(/^\[|\]$/g, '')) > 0,
  );
  const canonical = endpoints.filter(
    (endpoint) =>
      endpoint.kind !== 'lan' && new URL(endpoint.url).origin === configuration.canonicalOrigin,
  );
  return [...addresses.reverse(), ...canonical];
}

export function preferredRoute(
  probes: readonly RouteProbe[],
  provisional: boolean,
): HubEndpoint | null {
  const chosen = probes.find((probe) => probe.outcome === 'ok');
  if (chosen === undefined) return null;
  const nearer = probes.slice(0, probes.indexOf(chosen));
  return provisional || nearer.every((probe) => probe.outcome !== 'pending')
    ? chosen.endpoint
    : null;
}

export class DesktopRouteAuthority implements HubLeasePort {
  private readonly policies = new HubPolicies();
  private readonly scopes = new Map<string, RouteScope>();
  private closed = false;
  constructor(readonly emit: (state: NativeHubRouteSnapshot) => void) {}
  configure(configuration: NativeHubRouteConfiguration): NativeHubRouteSnapshot {
    const scopeId = configuration.trust.scopeId;
    const identityChanged = this.policies.configure(configuration.trust);
    const scope = this.scopes.get(scopeId) ?? new RouteScope(configuration);
    scope.reconfigure(configuration, identityChanged);
    this.scopes.set(scopeId, scope);
    this.reselect(scope);
    return scope.snapshot;
  }
  clear(scopeId: string): void {
    this.scopes.get(scopeId)?.retire();
    this.scopes.delete(scopeId);
    this.policies.clear(scopeId);
  }
  state(scopeId: string): NativeHubRouteSnapshot {
    return this.scope(scopeId).snapshot;
  }
  async refresh(scopeId: string): Promise<NativeHubRouteSnapshot> {
    const scope = this.scope(scopeId);
    this.reselect(scope);
    await scope.settled();
    return scope.snapshot;
  }
  networkChanged(): void {
    for (const scope of this.scopes.values()) {
      scope.networkChanged();
      this.reselect(scope);
    }
  }
  failed(scopeId: string, routeGeneration: number | undefined): void {
    const scope = this.scopes.get(scopeId);
    if (scope?.acceptsFailure(routeGeneration) === true) this.reselect(scope);
  }
  lease(scopeId: string, input: string): Lease {
    return { ...this.policies.lease(scopeId, input), signal: this.scope(scopeId).trust.signal };
  }
  resourceLease(scopeId: string, input: string): Lease {
    const endpoint = this.scope(scopeId).endpoint;
    if (endpoint === null) throw new HubTransportError('Your home is not reachable right now.');
    const url = new URL(input);
    return this.lease(scopeId, `${new URL(endpoint.url).origin}${url.pathname}${url.search}`);
  }
  close(): void {
    this.closed = true;
    for (const scopeId of [...this.scopes.keys()]) this.clear(scopeId);
    this.policies.close();
  }
  private scope(scopeId: string): RouteScope {
    const scope = this.scopes.get(scopeId);
    if (scope === undefined) throw new HubTransportError('Client route scope is not configured');
    return scope;
  }
  private reselect(scope: RouteScope): void {
    scope.reselect(() => this.select(scope));
  }
  private async select(scope: RouteScope): Promise<void> {
    const probes = scope.beginProbes();
    const trust = scope.configuration.trust;
    const signal = AbortSignal.any([probes.signal, AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS)]);
    const candidates = routeCandidates(scope.configuration);
    const asked: RouteProbe[] = candidates.map((endpoint) => ({ endpoint, outcome: 'pending' }));
    if (candidates.length === 0) this.publish(scope, null);
    await Promise.all(
      candidates.map(async (endpoint, index) => {
        const answered = await probeNodeRoute(
          { policies: this.policies, trust, log },
          endpoint,
          signal,
        );
        asked[index] = { endpoint, outcome: answered ? 'ok' : 'failed' };
        if (probes.signal.aborted || scope.probes !== probes || this.closed) return;
        const best = preferredRoute(asked, scope.endpoint === null);
        if (best !== null) this.publish(scope, best);
        else if (asked.every((probe) => probe.outcome !== 'pending')) this.publish(scope, null);
      }),
    );
  }
  private publish(scope: RouteScope, endpoint: HubEndpoint | null): void {
    if (scope.publish(endpoint)) this.emit(scope.snapshot);
  }
}
