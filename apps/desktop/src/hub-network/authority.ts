import {
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_ROUTE_SNAPSHOT,
  type NativeHubCredentialBinding,
  type NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import type { HubLeasePort } from '../../../hub/src/client-network/lease';
import type { NodeRouteView } from '../../../hub/src/service/route-view';
import { writeRouteNotice } from '../../../hub/src/service/route-notices';
import { Logger } from '@smarteverything/logging';
import { DesktopAuthorityView } from './authority-view.js';
import {
  enrollDesktopClient,
  refreshDesktopEndpoint,
  type DesktopClientEnrollment,
} from './authority-enrollment.js';
import { HubPolicies, HubTransportError } from './policy.js';
const log = new Logger('desktop.hub-route');
interface ClientScope {
  readonly enrollment: DesktopClientEnrollment;
  readonly controller: AbortController;
  snapshot: NativeHubRouteSnapshot;
}
export class DesktopRouteAuthority implements HubLeasePort {
  private readonly view: DesktopAuthorityView;
  private readonly policies = new HubPolicies();
  private readonly clients = new Map<string, ClientScope>();
  private readonly operations = new Map<string, AbortController>();
  private readonly refreshes = new Map<string, AbortController>();
  private observed: NodeRouteView | null = null;
  private generation = 0;
  private networkGeneration = 0;
  private starting: Promise<void> | null = null;
  private stopped = false;
  private readonly failures = new Set<string>();
  private pendingRevision: { readonly authorityId: string; readonly revision: number } | null =
    null;
  constructor(
    readonly directory: string,
    readonly emit: (state: NativeHubRouteSnapshot) => void,
  ) {
    this.view = new DesktopAuthorityView(directory, (): void => {
      this.clearAll();
    });
    this.view.subscribe((view): void => {
      this.changed(view);
    });
  }
  async configure(value: unknown): Promise<NativeHubRouteSnapshot> {
    const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
    const scopeId = configuration.trust.scopeId;
    if (this.stopped || (!this.clients.has(scopeId) && this.clients.size >= 32))
      throw new HubTransportError('Desktop route authority is stopped or full');
    this.generation += 1;
    this.clear(scopeId);
    const operation = new AbortController();
    this.operations.set(scopeId, operation);
    try {
      this.starting ??= this.view.start().catch((cause: unknown): never => {
        this.starting = null;
        throw cause;
      });
      await this.starting;
      const enrollment = await enrollDesktopClient(this.directory, configuration, operation.signal);
      if (this.operations.get(scopeId) !== operation || operation.signal.aborted)
        throw new HubTransportError('Desktop client enrollment was withdrawn');
      const client = {
        enrollment,
        controller: new AbortController(),
        snapshot: this.snapshot(enrollment, this.view.value),
      };
      this.policies.configure(configuration.trust);
      this.clients.set(scopeId, client);
      this.refreshEndpoint(scopeId, client, this.view.value);
      return client.snapshot;
    } finally {
      if (this.operations.get(scopeId) === operation) this.operations.delete(scopeId);
    }
  }
  clear(scopeId: string): void {
    this.refreshes.get(scopeId)?.abort();
    this.refreshes.delete(scopeId);
    this.operations.get(scopeId)?.abort();
    this.operations.delete(scopeId);
    this.clients
      .get(scopeId)
      ?.controller.abort(new HubTransportError('Client route scope withdrawn'));
    this.clients.delete(scopeId);
    this.policies.clear(scopeId);
  }
  private clearAll(): void {
    this.pendingRevision = null;
    this.changed(null);
    for (const scope of new Set([...this.clients.keys(), ...this.operations.keys()]))
      this.clear(scope);
  }
  state(scopeId: string): NativeHubRouteSnapshot {
    const client = this.clients.get(scopeId);
    if (client === undefined) throw new HubTransportError('Client route scope is not enrolled');
    return client.snapshot;
  }
  private snapshot(
    enrollment: DesktopClientEnrollment,
    view: NodeRouteView | null,
    previous?: NativeHubRouteSnapshot,
  ): NativeHubRouteSnapshot {
    const configuration = enrollment.configuration;
    const base = {
      scopeId: configuration.trust.scopeId,
      canonicalOrigin: configuration.canonicalOrigin,
      hubId: configuration.trust.identity.id,
      routeGeneration: previous?.routeGeneration ?? this.generation,
      networkGeneration: previous?.networkGeneration ?? this.networkGeneration,
    };
    if (this.checkingUnavailable(enrollment, view))
      return NATIVE_HUB_ROUTE_SNAPSHOT.parse({
        ...base,
        readiness: 'pending',
        detail: 'Node authority is checking its cached route.',
      });
    if (view === null)
      return NATIVE_HUB_ROUTE_SNAPSHOT.parse({
        ...base,
        readiness: 'unavailable',
        detail: 'Owned Node route authority is unavailable.',
      });
    const endpoint = view.state.endpoint;
    if (endpoint === null)
      return NATIVE_HUB_ROUTE_SNAPSHOT.parse({
        ...base,
        readiness: 'unavailable',
        detail: view.state.detail,
      });
    if (!this.allowed(enrollment, view))
      return NATIVE_HUB_ROUTE_SNAPSHOT.parse({
        ...base,
        readiness: 'unavailable',
        detail: 'Node route is not independently enrolled for this client.',
      });
    return NATIVE_HUB_ROUTE_SNAPSHOT.parse({
      ...base,
      readiness: 'ready',
      endpoint,
      detail: view.state.detail,
    });
  }
  private checkingUnavailable(
    enrollment: DesktopClientEnrollment,
    view: NodeRouteView | null,
  ): boolean {
    return this.pendingRevision !== null && (view === null || !this.allowed(enrollment, view));
  }
  private allowed(enrollment: DesktopClientEnrollment, view: NodeRouteView): boolean {
    const endpoint = view.state.endpoint;
    if (endpoint === null || view.canonicalOrigin !== enrollment.configuration.canonicalOrigin)
      return false;
    if (endpoint.kind !== 'lan')
      return new URL(endpoint.url).origin === enrollment.configuration.canonicalOrigin;
    return (
      view.state.localSupported &&
      view.trust !== null &&
      JSON.stringify(view.trust.identity) === JSON.stringify(enrollment.metadata.identity) &&
      enrollment.metadata.endpoints.some(
        (candidate) => candidate.kind === 'lan' && candidate.url === endpoint.url,
      ) &&
      enrollment.configuration.trust.endpoints.some(
        (candidate) => candidate.kind === 'lan' && candidate.url === endpoint.url,
      )
    );
  }
  async supported(): Promise<boolean> {
    try {
      if (!(await this.view.supported())) return false;
    } catch (cause) {
      log.warn('route.authority_unsupported', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
      return false;
    }
    try {
      await this.view.start();
    } catch (cause) {
      log.warn('route.view_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
    return true;
  }
  async refresh(scopeId: string): Promise<NativeHubRouteSnapshot> {
    this.state(scopeId);
    const view = this.view.value;
    if (view === null) throw new HubTransportError('Node authority is unavailable');
    this.pendingRevision = { authorityId: view.authorityId, revision: view.revision };
    this.publishPending();
    try {
      await writeRouteNotice(this.directory, view, 'refresh');
    } catch (cause) {
      this.pendingRevision = null;
      this.changed(this.view.value);
      throw cause;
    }
    const latest = this.view.value;
    if (latest !== null && latest.revision > view.revision) this.changed(latest);
    return this.state(scopeId);
  }
  failed(scopeId: string, generation: number | undefined): void {
    const client = this.clients.get(scopeId);
    const view = this.view.value;
    if (client === undefined || view === null || generation !== client.snapshot.routeGeneration)
      return;
    const key = `${view.authorityId}:${String(view.state.routeGeneration)}`;
    if (this.failures.has(key)) return;
    this.failures.add(key);
    if (this.failures.size > 64) this.failures.clear();
    void writeRouteNotice(this.directory, view, 'failed').catch((cause: unknown): void => {
      log.warn('route.notice_failed', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    });
  }
  private sameLease(previous: NodeRouteView | null, next: NodeRouteView | null): boolean {
    if (previous === null || next === null) return previous === next;
    const leaseIdentity = (view: NodeRouteView): string =>
      JSON.stringify({
        authorityId: view.authorityId,
        pid: view.pid,
        processStart: view.processStart,
        canonicalOrigin: view.canonicalOrigin,
        endpoint: view.state.endpoint,
        routeGeneration: view.state.routeGeneration,
        networkGeneration: view.state.networkGeneration,
        localSupported: view.state.localSupported,
        identity: view.trust?.identity,
      });
    return leaseIdentity(previous) === leaseIdentity(next);
  }
  private publishPending(): void {
    for (const [scopeId, client] of this.clients) {
      client.snapshot = this.snapshot(client.enrollment, this.observed, client.snapshot);
      this.emit(client.snapshot);
      this.clients.set(scopeId, client);
    }
  }
  private changed(view: NodeRouteView | null): void {
    if (
      view !== null &&
      (view.authorityId !== this.pendingRevision?.authorityId ||
        view.revision > this.pendingRevision.revision)
    )
      this.pendingRevision = null;
    const retired = !this.sameLease(this.observed, view);
    this.observed = view;
    if (retired) {
      this.generation += 1;
      this.networkGeneration += 1;
    }
    for (const [scopeId, previous] of this.clients) {
      if (retired)
        previous.controller.abort(
          new HubTransportError('Owned Node route changed; effects may be unknown'),
        );
      const client = {
        enrollment: previous.enrollment,
        controller: retired ? new AbortController() : previous.controller,
        snapshot: this.snapshot(previous.enrollment, view, retired ? undefined : previous.snapshot),
      };
      this.clients.set(scopeId, client);
      this.emit(client.snapshot);
      this.refreshEndpoint(scopeId, client, view, retired);
    }
  }
  private refreshable(
    enrollment: DesktopClientEnrollment,
    view: NodeRouteView | null,
  ): view is NodeRouteView {
    return (
      view !== null &&
      view.state.endpoint?.kind === 'lan' &&
      view.state.localSupported &&
      view.canonicalOrigin === enrollment.configuration.canonicalOrigin &&
      JSON.stringify(view.trust?.identity) === JSON.stringify(enrollment.metadata.identity) &&
      !this.allowed(enrollment, view)
    );
  }
  private refreshEndpoint(
    scopeId: string,
    client: ClientScope,
    view: NodeRouteView | null,
    retired = true,
  ): void {
    if (!retired) return;
    this.refreshes.get(scopeId)?.abort();
    this.refreshes.delete(scopeId);
    if (!this.refreshable(client.enrollment, view)) return;
    const endpoint = view.state.endpoint;
    if (endpoint === null) return;
    const operation = new AbortController();
    this.refreshes.set(scopeId, operation);
    void refreshDesktopEndpoint(client.enrollment, endpoint, operation.signal)
      .then((enrollment): void => {
        const current = this.clients.get(scopeId);
        if (
          current?.enrollment !== client.enrollment ||
          current.controller !== client.controller ||
          operation.signal.aborted ||
          this.stopped
        )
          return;
        this.policies.configure(enrollment.configuration.trust);
        const updated = {
          ...current,
          enrollment,
          snapshot: this.snapshot(enrollment, this.observed, current.snapshot),
        };
        this.clients.set(scopeId, updated);
        this.emit(updated.snapshot);
      })
      .catch((cause: unknown): void => {
        if (!operation.signal.aborted)
          log.warn('route.client_inventory_failed', {
            error_name: cause instanceof Error ? cause.name : 'unknown',
          });
      })
      .finally((): void => {
        if (this.refreshes.get(scopeId) === operation) this.refreshes.delete(scopeId);
      });
  }
  authorize(scopeId: string, bearer: string | undefined): void {
    const token = this.clients.get(scopeId)?.enrollment.token;
    if (token === undefined || bearer !== `Bearer ${token}`)
      throw new HubTransportError('Request credential differs from independently paired client');
  }
  authorizeSocket(scopeId: string, protocols: readonly string[]): void {
    const token = this.clients.get(scopeId)?.enrollment.token;
    const bearers = protocols.filter((protocol) => protocol.startsWith('bearer.'));
    if (token === undefined || bearers.length !== 1 || bearers[0] !== `bearer.${token}`)
      throw new HubTransportError('Socket credential differs from independently paired client');
  }
  private validateUrl(input: string, endpoint: string): URL {
    const url = new URL(input);
    if (
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== '' ||
      url.origin !== new URL(endpoint).origin
    )
      throw new HubTransportError('Request URL differs from the selected Node route');
    return url;
  }
  lease(
    scopeId: string,
    input: string,
    binding?: NativeHubCredentialBinding,
    routeGeneration?: number,
  ): ReturnType<HubLeasePort['lease']> {
    const client = this.clients.get(scopeId);
    if (client?.snapshot.readiness !== 'ready' || this.stopped || !this.view.admitting)
      throw new HubTransportError('Client route authority has no ready lease');
    if (
      binding === undefined ||
      JSON.stringify(binding) !== JSON.stringify(client.enrollment.configuration.bindings[0]) ||
      routeGeneration !== client.snapshot.routeGeneration
    )
      throw new HubTransportError('Client principal or route generation is stale');
    const url = this.validateUrl(input, client.snapshot.endpoint.url);
    const transport =
      client.snapshot.endpoint.kind === 'lan'
        ? this.policies.lease(scopeId, input)
        : { url, agent: undefined };
    return { ...transport, signal: client.controller.signal };
  }
  resourceLease(
    scopeId: string,
    input: string,
    binding?: NativeHubCredentialBinding,
    routeGeneration?: number,
  ): ReturnType<HubLeasePort['lease']> {
    const client = this.clients.get(scopeId);
    if (client?.snapshot.readiness !== 'ready' || binding === undefined)
      throw new HubTransportError('Resource client has no observed ready route');
    const url = this.validateUrl(input, client.enrollment.configuration.canonicalOrigin);
    const selected = new URL(client.snapshot.endpoint.url);
    return this.lease(
      scopeId,
      `${selected.origin}${url.pathname}${url.search}`,
      binding,
      routeGeneration ?? client.snapshot.routeGeneration,
    );
  }
  close(): void {
    this.stopped = true;
    this.clearAll();
    this.view.stop();
    this.policies.close();
  }
}
