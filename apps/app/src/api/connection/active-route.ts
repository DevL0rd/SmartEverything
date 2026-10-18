import {
  type HubConnectionMetadata,
  type HubEndpoint,
  type NativeHubDiscovery,
  type NativeHubCredentialBinding,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { ValueStore } from '../../design/external-store';
import type { ServerConnection } from './storage';
import {
  fetchHubMetadata,
  readHubTrust,
  rememberHubTrust,
  sameHubInventory,
} from './trust-storage';
import { hubFetch } from './route-platform';
import { ProbingRouteAuthority } from './route-probes';
import {
  bootstrapEndpoint,
  requireTrustedBootstrap,
  usableEndpointsForMedia,
  HubRouteUnavailableError,
  StaleHubRouteError,
} from './route-policy';
import { nativeRouteFacade } from './native-route-facade';
import { countEvent, failureFacts, nowMs } from './request-log';
import { noteRouteStateChange } from './native-route-diagnostics';

const log = new Logger('app.hub-route');
export interface HubRouteLease {
  readonly baseUrl: string;
  readonly scopeId: string;
  readonly generation: number;
  readonly endpoint: HubEndpoint;
  readonly binding?: NativeHubCredentialBinding;
  readonly nativeAuthority?: boolean;
  readonly nativeRouteGeneration?: number;
  readonly nativeNetworkGeneration?: number;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly isCurrent: () => boolean;
  readonly failed: () => void;
}
export interface HubRouteState {
  readonly endpoint: HubEndpoint | null;
  readonly generation: number;
  readonly metadata: HubConnectionMetadata | null;
  readonly discovery: NativeHubDiscovery | null;
  readonly problem: string | null;
}

export interface RouteHost {
  readonly connection: ServerConnection;
  readonly scopeId: string;
  readonly canonical: HubEndpoint;
  readonly current: () => HubRouteState;
  readonly publish: (update: Partial<HubRouteState>) => void;
  readonly metadata: () => Promise<HubConnectionMetadata>;
  readonly connected: (endpoint: HubEndpoint) => void;
  readonly lease: (
    endpoint: HubEndpoint,
    isCurrent: () => boolean,
    failed: () => void,
  ) => HubRouteLease;
}

export interface RouteAuthority {
  start(): void;
  stop(): void;
  ready(): Promise<void>;
  refresh(supersede?: boolean): void;
  discover?(): void;
  invalidate(): void;
  update(metadata: HubConnectionMetadata): void;
  lease(): HubRouteLease;
}

export class ActiveHubRoute {
  readonly state = new ValueStore<HubRouteState>({
    endpoint: null,
    generation: 0,
    metadata: null,
    discovery: null,
    problem: null,
  });
  scopeId = randomUUID();
  private stopped = false;
  private metadataTask: Promise<HubConnectionMetadata> | null = null;
  private syncedUrl: string | null = null;
  private readonly canonical: HubEndpoint;
  private authority: RouteAuthority;

  constructor(readonly connection: ServerConnection) {
    this.canonical = bootstrapEndpoint(connection.url, connection.canonicalKind);
    this.state.set({ ...this.state.get(), endpoint: this.canonical });
    this.authority = this.createAuthority();
  }

  private createAuthority(): RouteAuthority {
    const host: RouteHost = {
      connection: this.connection,
      scopeId: this.scopeId,
      canonical: this.canonical,
      current: (): HubRouteState => this.state.get(),
      publish: (update): void => {
        const before = this.state.get();
        const after = { ...before, ...update };
        this.state.set(after);
        noteRouteStateChange(this.scopeId, before, after);
      },
      metadata: (): Promise<HubConnectionMetadata> => this.metadata(),
      connected: (endpoint): void => {
        this.syncInventory(endpoint);
      },
      lease: (endpoint, isCurrent, failed): HubRouteLease =>
        this.leaseOf(endpoint, isCurrent, failed),
    };
    const native = nativeRouteFacade(host);
    log.debug('route.authority_created', () => ({
      scopeId: this.scopeId.slice(0, 8),
      authority: native === null ? 'probing' : 'native',
      canonicalKind: this.canonical.kind,
    }));
    return native ?? new ProbingRouteAuthority(host);
  }

  start(): void {
    log.info('route.manager_started', {
      scopeId: this.scopeId.slice(0, 8),
      restarted: this.stopped,
      generation: this.state.get().generation,
    });
    if (this.stopped) {
      this.scopeId = randomUUID();
      this.syncedUrl = null;
      this.state.set({ ...this.state.get(), endpoint: this.canonical });
      this.authority = this.createAuthority();
    }
    this.stopped = false;
    this.authority.start();
  }

  async ready(): Promise<void> {
    const authority = this.authority;
    await authority.ready();
    if (authority !== this.authority && !this.stopped) await this.ready();
  }

  discover(): void {
    this.authority.discover?.();
  }

  stop(): void {
    log.info('route.manager_stopped', {
      scopeId: this.scopeId.slice(0, 8),
      alreadyStopped: this.stopped,
      generation: this.state.get().generation,
    });
    this.stopped = true;
    this.authority.stop();
    this.state.set({ ...this.state.get(), generation: this.state.get().generation + 1 });
  }

  get running(): boolean {
    return !this.stopped;
  }

  invalidate(): void {
    log.info('route.invalidated', {
      scopeId: this.scopeId.slice(0, 8),
      stopped: this.stopped,
      generation: this.state.get().generation,
    });
    if (this.stopped)
      this.state.set({ ...this.state.get(), generation: this.state.get().generation + 1 });
    else this.authority.invalidate();
  }

  refresh(supersede = true): void {
    countEvent('route.refresh_requested');
    log.trace('route.refresh_requested', { supersede, stopped: this.stopped });
    this.authority.refresh(supersede);
  }

  lease(media = false): HubRouteLease {
    countEvent(media ? 'route.lease_media' : 'route.lease');
    return media ? this.mediaLease() : this.authority.lease();
  }

  private mediaLease(): HubRouteLease {
    const state = this.state.get();
    const endpoint =
      state.endpoint?.kind === 'lan'
        ? usableEndpointsForMedia(state.metadata, this.canonical)
        : state.endpoint;
    if (endpoint === null || this.stopped)
      throw new HubRouteUnavailableError("Can't do this on this connection. Try again.");
    const scopeId = this.scopeId;
    return this.leaseOf(
      endpoint,
      () => !this.stopped && scopeId === this.scopeId,
      () => {
        this.authority.refresh(false);
      },
    );
  }

  private leaseOf(
    endpoint: HubEndpoint,
    isCurrent: () => boolean,
    failed: () => void,
  ): HubRouteLease {
    const scopeId = this.scopeId;
    return {
      baseUrl: endpoint.url,
      scopeId,
      generation: this.state.get().generation,
      endpoint,
      fetch: (url, init): Promise<Response> => {
        if (!isCurrent()) throw new StaleHubRouteError(init.method ?? 'GET');
        return hubFetch(scopeId, endpoint, url, init);
      },
      isCurrent,
      failed: (): void => {
        if (isCurrent()) failed();
      },
    };
  }

  private metadata(): Promise<HubConnectionMetadata> {
    const known = this.state.get().metadata;
    if (known !== null) return Promise.resolve(known);
    this.metadataTask ??= this.loadMetadata().catch((error: unknown) => {
      this.metadataTask = null;
      log.warn('route.metadata_failed', {
        scopeId: this.scopeId.slice(0, 8),
        ...failureFacts(error),
      });
      throw error;
    });
    return this.metadataTask.then((metadata) => {
      this.state.set({ ...this.state.get(), metadata });
      return metadata;
    });
  }

  private async loadMetadata(): Promise<HubConnectionMetadata> {
    const startedAt = nowMs();
    const saved = await readHubTrust(this.connection);
    if (saved !== null) {
      log.debug('route.metadata_loaded', () => ({
        source: 'trust_cache',
        endpoints: saved.endpoints.length,
        elapsedMs: nowMs() - startedAt,
      }));
      return saved;
    }
    requireTrustedBootstrap(this.canonical);
    const scopeId = this.scopeId;
    const metadata = await fetchHubMetadata(this.connection, this.canonical.url, (url, init) =>
      hubFetch(scopeId, this.canonical, url, init),
    );
    await rememberHubTrust(this.connection, metadata);
    log.info('route.metadata_loaded', {
      source: 'hub',
      canonicalKind: this.canonical.kind,
      endpoints: metadata.endpoints.length,
      elapsedMs: nowMs() - startedAt,
    });
    return metadata;
  }

  private syncInventory(endpoint: HubEndpoint): void {
    if (this.stopped || endpoint.url === this.syncedUrl) return;
    this.syncedUrl = endpoint.url;
    this.refreshInventory().catch((error: unknown) => {
      if (this.syncedUrl === endpoint.url) this.syncedUrl = null;
      log.warn('route.inventory_refresh_failed', failureFacts(error));
    });
  }

  private async refreshInventory(): Promise<void> {
    const startedAt = nowMs();
    const lease = this.authority.lease();
    const fresh = await fetchHubMetadata(this.connection, lease.baseUrl, lease.fetch);
    const known = await this.metadata();
    const sameHub = fresh.identity.id === known.identity.id;
    const same = sameHub && sameHubInventory(known, fresh);
    log.debug('route.inventory_checked', () => ({
      routeKind: lease.endpoint.kind,
      sameHub,
      unchanged: same,
      endpoints: fresh.endpoints.length,
      elapsedMs: nowMs() - startedAt,
    }));
    if (!sameHub || same) return;
    await rememberHubTrust(this.connection, fresh);
    log.info('route.inventory_changed', { endpoints: fresh.endpoints.length });
    if (!this.stopped) this.authority.update(fresh);
  }
}

let active: ActiveHubRoute | null = null;
export function routeFor(connection: ServerConnection): ActiveHubRoute {
  if (active?.connection !== connection) {
    active?.stop();
    active = new ActiveHubRoute(connection);
  }
  return active;
}
export function stopHubRoute(): void {
  active?.stop();
  active = null;
}
export function assertHubLease(lease: HubRouteLease, method: string): void {
  if (!lease.isCurrent()) throw new StaleHubRouteError(method);
}
