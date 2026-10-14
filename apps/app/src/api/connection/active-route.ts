import {
  HUB_CONNECTION_METADATA,
  type HubConnectionMetadata,
  type HubEndpoint,
  type NativeHubDiscovery,
  type NativeHubCredentialBinding,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { ValueStore } from '../../design/external-store';
import type { ServerConnection } from './storage';
import { readHubTrust, rememberHubTrust } from './trust-storage';
import { configureRouteTrust, clearRouteTrust, hubNetwork, pinnedFetch } from './route-platform';
import { probeHubEndpoint, retireHubProbes } from './route-probes';
import {
  bootstrapEndpoint,
  requireTrustedBootstrap,
  trustedBootstrap,
  usableEndpoints,
  trustOf,
  usableEndpointsForMedia,
  PROBE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  MAX_PROBES,
  HubRouteUnavailableError,
  StaleHubRouteError,
} from './route-policy';

import { nativeRouteFacade, type NativeRouteFacade } from './native-route-facade';

const log = new Logger('app.hub-route');
export interface HubRouteLease {
  readonly baseUrl: string;
  readonly scopeId: string;
  readonly generation: number;
  readonly endpoint: HubEndpoint;
  readonly binding?: NativeHubCredentialBinding;
  readonly nativeAuthority?: boolean;
  readonly nativeRouteGeneration?: number;
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
  private probing: Promise<void> | null = null;
  private probeGeneration = 0;
  private queued = false;
  private unsubscribe: (() => void) | null = null;
  private metadataTask: Promise<HubConnectionMetadata> | null = null;
  private configuredScope: string | null = null;
  private readiness: Promise<void> | null = null;
  private discovering: Promise<void> | null = null;
  private readonly canonical: HubEndpoint;
  private nativeFacade: NativeRouteFacade | null = null;

  constructor(readonly connection: ServerConnection) {
    this.canonical = bootstrapEndpoint(connection.url, connection.canonicalKind);
    this.state.set({ ...this.state.get(), endpoint: this.canonical });
    this.nativeFacade = nativeRouteFacade(this, (): Promise<HubConnectionMetadata> =>
      this.loadMetadata(),
    );
  }

  start(): void {
    if (this.nativeFacade !== null) {
      if (this.stopped) {
        this.scopeId = randomUUID();
        this.nativeFacade = nativeRouteFacade(this, (): Promise<HubConnectionMetadata> =>
          this.loadMetadata(),
        );
      }
      this.stopped = false;
      this.nativeFacade?.start();
      return;
    }
    if (this.unsubscribe !== null) return;
    if (this.stopped) {
      this.scopeId = randomUUID();
      this.readiness = null;
      this.configuredScope = null;
      this.state.set({ ...this.state.get(), endpoint: this.canonical });
    }
    this.stopped = false;
    this.unsubscribe = hubNetwork().subscribeDiscovery((discovery) => {
      const previous = this.state.get().discovery;
      this.state.set({ ...this.state.get(), discovery });
      if (previous === null) {
        this.refresh();
        return;
      }
      if (
        previous.generation !== discovery.generation ||
        JSON.stringify(previous.candidates) !== JSON.stringify(discovery.candidates)
      )
        this.refresh();
    });
    this.discover();
    this.refresh();
  }

  ready(): Promise<void> {
    return this.nativeFacade?.ready() ?? (this.readiness ??= this.prepareInitialRoute());
  }

  private async prepareInitialRoute(): Promise<void> {
    if (!hubNetwork().capabilities.http) return;
    const scopeId = this.scopeId;
    this.refresh(false);
    let complete: () => void = () => undefined;
    const deadline = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const timer = setTimeout(complete, REQUEST_TIMEOUT_MS + PROBE_TIMEOUT_MS);
    try {
      await Promise.race([this.waitForProbes(), deadline]);
    } finally {
      clearTimeout(timer);
    }
    if (scopeId !== this.scopeId && !this.stopped) await this.ready();
  }

  private async waitForProbes(): Promise<void> {
    while (this.probing !== null && !this.stopped) await this.probing;
  }

  discover(): void {
    if (this.nativeFacade !== null || this.stopped || this.discovering !== null) return;
    const scopeId = this.scopeId;
    const task = hubNetwork()
      .startDiscovery()
      .then((discovery) => {
        if (this.stopped || this.scopeId !== scopeId) return;
        this.state.set({ ...this.state.get(), discovery });
        this.refresh();
      })
      .catch((error: unknown) => {
        log.warn('route.discovery_failed', {
          failure: error instanceof Error ? error.name : 'NativeFailure',
        });
      })
      .finally(() => {
        if (this.discovering === task) this.discovering = null;
      });
    this.discovering = task;
  }

  stop(): void {
    if (this.nativeFacade !== null) {
      this.stopped = true;
      this.nativeFacade.stop();
      this.invalidate();
      return;
    }
    this.stopped = true;
    this.probeGeneration += 1;
    this.probing = null;
    this.discovering = null;
    this.queued = false;
    this.configuredScope = null;
    retireHubProbes(this.scopeId);
    this.invalidate();
    this.unsubscribe?.();
    this.unsubscribe = null;
    void hubNetwork()
      .stopDiscovery()
      .catch((error: unknown) => {
        log.warn('route.discovery_stop_failed', {
          failure: error instanceof Error ? error.name : 'NativeFailure',
        });
      });
    if (hubNetwork().capabilities.http) void clearRouteTrust(this.scopeId);
  }

  get running(): boolean {
    return !this.stopped;
  }

  invalidate(): void {
    if (this.nativeFacade !== null && !this.stopped) {
      this.nativeFacade.invalidate();
      return;
    }
    this.state.set({ ...this.state.get(), generation: this.state.get().generation + 1 });
  }

  lease(media = false): HubRouteLease {
    return this.nativeFacade !== null && !media
      ? this.nativeFacade.lease()
      : this.platformLease(media);
  }
  private platformLease(media: boolean): HubRouteLease {
    const state = this.state.get();
    let endpoint = state.endpoint;
    if (media && endpoint?.kind === 'lan' && !hubNetwork().capabilities.media)
      endpoint = usableEndpointsForMedia(state.metadata, this.canonical);
    if (
      endpoint === null ||
      this.stopped ||
      (endpoint.kind === 'lan' && this.configuredScope !== this.scopeId)
    )
      throw new HubRouteUnavailableError('No trusted hub route supports this operation.');
    const selected = endpoint;
    const scopeId = this.scopeId;
    const isCurrent = (): boolean =>
      !this.stopped &&
      state.generation === this.state.get().generation &&
      scopeId === this.scopeId &&
      (selected.kind !== 'lan' || this.configuredScope === scopeId);
    return {
      baseUrl: selected.url,
      scopeId,
      generation: state.generation,
      endpoint: selected,
      fetch: (url, init): Promise<Response> => {
        if (!isCurrent()) throw new StaleHubRouteError(init.method ?? 'GET');
        return this.send(selected, url, init);
      },
      isCurrent,
      failed: (): void => {
        if (isCurrent()) this.refresh(false);
      },
    };
  }

  refresh(supersede = true): void {
    if (this.nativeFacade !== null) {
      this.nativeFacade.refresh();
      return;
    }
    if (this.stopped) return;
    if (this.probing !== null) {
      if (supersede) {
        this.queued = true;
        this.probeGeneration += 1;
      }
      return;
    }
    this.probeGeneration += 1;
    const run = this.probeGeneration;
    const scopeId = this.scopeId;
    const task = this.resolve(run, scopeId)
      .catch((error: unknown) => {
        if (this.currentProbe(run))
          this.state.set({
            ...this.state.get(),
            problem: error instanceof Error ? error.message : 'Hub route verification failed.',
          });
      })
      .finally(() => {
        if (this.probing !== task) return;
        this.probing = null;
        if (this.queued) {
          this.queued = false;
          this.refresh();
        }
      });
    this.probing = task;
  }

  private async metadata(run: number): Promise<HubConnectionMetadata | null> {
    const known = this.state.get().metadata;
    if (known !== null) return known;
    this.metadataTask ??= this.loadMetadata().catch((error: unknown) => {
      this.metadataTask = null;
      throw error;
    });
    const metadata = await this.metadataTask;
    if (!this.currentProbe(run)) return null;
    this.state.set({ ...this.state.get(), metadata });
    return metadata;
  }

  private async loadMetadata(): Promise<HubConnectionMetadata> {
    const saved = await readHubTrust(this.connection);
    if (saved !== null) return saved;
    requireTrustedBootstrap(this.canonical);
    const response = await this.send(this.canonical, `${this.canonical.url}/api/connection`, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.connection.token}` },
    });
    if (!response.ok)
      throw new HubRouteUnavailableError(
        `Trusted hub metadata returned HTTP ${String(response.status)}.`,
      );
    const metadata = HUB_CONNECTION_METADATA.parse(await response.json());
    await rememberHubTrust(this.connection, metadata);
    return metadata;
  }

  private async resolve(run: number, scopeId: string): Promise<void> {
    if (!trustedBootstrap(this.canonical.url) && this.connection.trustedMetadata === undefined)
      return;
    const metadata = await this.metadata(run);
    if (metadata === null) return;
    const inventory = this.inventory(metadata);
    const problem = await this.configure(inventory, scopeId);
    if (!this.currentProbe(run)) return;
    const endpoints = usableEndpoints(inventory, this.canonical).filter(
      (endpoint) => endpoint.kind !== 'lan' || problem === null,
    );
    const remote = endpoints.find((endpoint) => endpoint.kind === 'remote');
    const local = endpoints
      .filter((endpoint) => endpoint.kind !== 'remote')
      .slice(0, MAX_PROBES - 1);
    const candidates = remote === undefined ? local : [...local, remote];
    const answers = await Promise.all(
      candidates.map(async (endpoint) => ({
        endpoint,
        reachable: await probeHubEndpoint(scopeId, endpoint, metadata),
      })),
    );
    if (!this.currentProbe(run)) return;
    const selected = answers.find((answer) => answer.reachable)?.endpoint;
    if (selected === undefined)
      throw new HubRouteUnavailableError(
        'No independently trusted hub endpoint answered its identity probe.',
      );
    this.select(selected, problem);
  }

  private select(selected: HubEndpoint, problem: string | null): void {
    const current = this.state.get();
    if (current.endpoint?.url === selected.url) {
      this.state.set({ ...current, problem });
      return;
    }
    this.state.set({
      ...current,
      endpoint: selected,
      generation: current.generation + 1,
      problem,
    });
    log.info('route.selected', { kind: selected.kind, generation: this.state.get().generation });
  }

  private currentProbe(run: number): boolean {
    return run === this.probeGeneration && !this.stopped;
  }

  private inventory(metadata: HubConnectionMetadata): HubConnectionMetadata {
    const discovered = this.state.get().discovery?.candidates ?? [];
    const urls = new Set(metadata.endpoints.map((endpoint) => endpoint.url));
    const added: HubEndpoint[] = discovered
      .filter((candidate) => candidate.hubId === metadata.identity.id && !urls.has(candidate.url))
      .map((candidate) => ({ kind: 'lan', url: candidate.url }));
    return { ...metadata, endpoints: [...metadata.endpoints, ...added].slice(0, 32) };
  }

  private async configure(
    inventory: HubConnectionMetadata,
    scopeId: string,
  ): Promise<string | null> {
    if (
      !hubNetwork().capabilities.http ||
      !inventory.endpoints.some((endpoint) => endpoint.kind === 'lan')
    )
      return null;
    try {
      await configureRouteTrust(trustOf(scopeId, inventory));
      if (this.stopped || this.scopeId !== scopeId) {
        await clearRouteTrust(scopeId);
        return 'This hub trust scope was retired.';
      }
      this.configuredScope = scopeId;
      return null;
    } catch (error) {
      if (this.scopeId === scopeId) this.configuredScope = null;
      return error instanceof Error ? error.message : 'Native pin transport is unavailable.';
    }
  }

  private async send(endpoint: HubEndpoint, url: string, init: RequestInit): Promise<Response> {
    if (endpoint.kind === 'lan') return pinnedFetch(this.scopeId, url, init);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
      const text = await response.text();
      return new Response(text === '' ? null : text, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      clearTimeout(timer);
    }
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
