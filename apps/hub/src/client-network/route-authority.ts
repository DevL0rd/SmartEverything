import type { Agent } from 'node:https';
import { isIP } from 'node:net';
import {
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
  type HubEndpoint,
  type HubDiscoveryCandidate,
  type NativeHubCredentialBinding,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { HubPolicies, HubTransportError } from './policy';
import { NodeRouteStore } from './route-store';
import {
  bootstrapNodeTrust,
  canonicalEndpoint,
  NodeEnrollmentRefusedError,
  type NodeRouteIdentity,
} from './route-trust';
import { probeNodeRoute, ROUTE_PROBE_TIMEOUT_MS, MAX_ROUTE_PROBES } from './route-probes';
import { NodeRouteEvents } from './route-events';
import type { DiscoveryBus } from '../network/avahi-bus';

export interface NodeRouteState {
  readonly endpoint: HubEndpoint | null;
  readonly routeGeneration: number;
  readonly networkGeneration: number;
  readonly localSupported: boolean;
  readonly detail: string;
}
export class NodeRouteAuthority {
  readonly policies = new HubPolicies();
  private configuration: NativeHubRouteConfiguration | null = null;
  private readonly viewListeners = new Set<() => void>();
  private readonly listeners = new Set<(state: NodeRouteState) => void>();
  private readonly store: NodeRouteStore;
  private readonly canonical: HubEndpoint;
  private readonly events: NodeRouteEvents;
  private stateValue: NodeRouteState;
  private scope = new AbortController();
  private probes = new AbortController();
  private batch: Promise<void> | null = null;
  private pending = false;
  private stopped = false;
  private writing: Promise<void> = Promise.resolve();
  constructor(
    private readonly options: NodeRouteIdentity & {
      readonly directory: string;
      readonly log: Logger;
      readonly bus?: () => DiscoveryBus;
    },
  ) {
    this.canonical = canonicalEndpoint(options.hubUrl);
    this.store = new NodeRouteStore(options.directory, options.token);
    this.stateValue = {
      endpoint: this.canonical,
      routeGeneration: 0,
      networkGeneration: 0,
      localSupported: false,
      detail: 'Local routing requires independently verified node enrollment.',
    };
    this.events = new NodeRouteEvents({
      log: options.log,
      ...(options.bus === undefined ? {} : { bus: options.bus }),
      changed: (): void => {
        this.networkChanged();
      },
      discovered: (candidate): void => {
        this.discovered(candidate);
      },
    });
  }
  get state(): NodeRouteState {
    return this.stateValue;
  }
  subscribe(listener: (state: NodeRouteState) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  get view(): {
    readonly canonicalOrigin: string;
    readonly state: NodeRouteState;
    readonly trust: NativeHubRouteConfiguration['trust'] | null;
  } {
    return {
      canonicalOrigin: this.canonical.url,
      state: this.stateValue,
      trust: this.configuration?.trust ?? null,
    };
  }
  observe(listener: () => void): () => void {
    this.viewListeners.add(listener);
    return (): void => {
      this.viewListeners.delete(listener);
    };
  }
  async start(): Promise<void> {
    try {
      const stored = await this.store.read();
      if (stored !== null) this.configure(stored);
    } catch (cause) {
      this.options.log.warn('route.saved_trust_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
    try {
      const fresh = await bootstrapNodeTrust(this.options);
      if (fresh !== null) {
        this.configure(fresh);
        await this.store.write(fresh);
      }
    } catch (cause) {
      if (cause instanceof NodeEnrollmentRefusedError) await this.withdrawEnrollment();
      this.options.log.warn('route.bootstrap_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
    if (this.configuration !== null) await this.refresh();
    await this.events.start(this.configuration !== null);
  }
  private async withdrawEnrollment(): Promise<void> {
    this.configuration = null;
    this.pending = false;
    this.probes.abort();
    this.policies.close();
    this.publish(
      this.canonical,
      false,
      'Canonical hub refused node enrollment; local credentials are disabled.',
      true,
    );
    await this.store.withdraw();
  }
  private configure(value: NativeHubRouteConfiguration): NativeHubRouteConfiguration {
    const parsed = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
    if (parsed.canonicalOrigin !== this.canonical.url || parsed.bindings.length !== 1)
      throw new HubTransportError('Stored node route differs from canonical enrollment');
    const binding = parsed.bindings[0];
    if (
      binding?.credentialKind !== 'node' ||
      binding.principalId !== this.options.deviceId ||
      parsed.trust.scopeId !== `node:${this.options.deviceId}`
    )
      throw new HubTransportError('Stored node route belongs to another credential principal');
    this.policies.configure(parsed.trust);
    this.configuration = parsed;
    return parsed;
  }
  async refresh(): Promise<void> {
    if (this.stopped) return;
    if (this.batch !== null) return this.batch;
    const work = this.select();
    this.batch = work.finally(() => {
      this.batch = null;
      if (this.pending && !this.stopped) {
        this.pending = false;
        void this.refresh().catch((cause: unknown) => {
          this.options.log.error('route.refresh_failed', cause);
        });
      }
    });
    return this.batch;
  }
  private async select(): Promise<void> {
    const configuration = this.configuration;
    if (configuration === null) return;
    const epoch = this.stateValue.networkGeneration;
    this.probes.abort();
    this.probes = new AbortController();
    const signal = AbortSignal.any([
      this.probes.signal,
      AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS),
    ]);
    const candidates = this.candidates(configuration);
    const answers = candidates.map(async (endpoint) =>
      (await probeNodeRoute(
        { policies: this.policies, trust: configuration.trust, log: this.options.log },
        endpoint,
        signal,
      ))
        ? endpoint
        : null,
    );
    try {
      let chosen: HubEndpoint | null = null;
      for (const answer of answers) {
        chosen = await answer;
        if (chosen !== null) break;
      }
      if (
        this.stopped ||
        epoch !== this.stateValue.networkGeneration ||
        configuration !== this.configuration
      )
        return;
      this.publish(
        chosen,
        true,
        chosen === null
          ? 'No enrolled hub endpoint is reachable.'
          : 'Independently enrolled route selected.',
      );
    } finally {
      await Promise.all(answers);
    }
  }
  private candidates(configuration: NativeHubRouteConfiguration): readonly HubEndpoint[] {
    const locals = configuration.trust.endpoints
      .filter(
        (endpoint) =>
          endpoint.kind === 'lan' &&
          isIP(new URL(endpoint.url).hostname.replace(/^\[|\]$/g, '')) > 0,
      )
      .reverse()
      .slice(0, MAX_ROUTE_PROBES - 1);
    return [...locals, this.canonical];
  }
  private publish(
    endpoint: HubEndpoint | null,
    localSupported: boolean,
    detail: string,
    withdrawLease = false,
  ): void {
    const changed = withdrawLease || this.stateValue.endpoint?.url !== endpoint?.url;
    if (changed) {
      this.scope.abort(new HubTransportError('Hub route changed; effects may be unknown'));
      this.scope = new AbortController();
    }
    this.stateValue = {
      ...this.stateValue,
      endpoint,
      localSupported,
      detail,
      routeGeneration: this.stateValue.routeGeneration + (changed ? 1 : 0),
    };
    if (changed) for (const listener of this.listeners) listener(this.stateValue);
    for (const listener of this.viewListeners) listener();
  }
  private networkChanged(): void {
    if (this.stopped) return;
    this.probes.abort();
    this.stateValue = {
      ...this.stateValue,
      networkGeneration: this.stateValue.networkGeneration + 1,
    };
    if (this.configuration !== null)
      this.publish(null, true, 'Network changed; checking enrolled routes.');
    if (this.batch !== null) this.pending = true;
    void this.refresh().catch((cause: unknown) => {
      this.options.log.error('route.refresh_failed', cause);
    });
    if (this.configuration !== null) void this.events.discover();
  }
  failed(generation: number): void {
    if (this.stopped || generation !== this.stateValue.routeGeneration) return;
    if (this.batch !== null) this.pending = true;
    void this.refresh().catch((cause: unknown) => {
      this.options.log.error('route.refresh_failed', cause);
    });
  }
  private discovered(candidate: HubDiscoveryCandidate): void {
    const configuration = this.configuration;
    if (configuration === null || candidate.hubId !== configuration.trust.identity.id) return;
    const address = new URL(candidate.url).hostname.replace(/^\[|\]$/g, '');
    if (
      isIP(address) === 0 ||
      configuration.trust.endpoints.some(
        (endpoint) => new URL(endpoint.url).origin === new URL(candidate.url).origin,
      ) ||
      configuration.trust.endpoints.length >= 32 ||
      configuration.trust.lanAddresses.length >= 32
    )
      return;
    const updated = NATIVE_HUB_ROUTE_CONFIGURATION.parse({
      ...configuration,
      trust: {
        ...configuration.trust,
        endpoints: [...configuration.trust.endpoints, { kind: 'lan', url: candidate.url }],
        lanAddresses: [...new Set([...configuration.trust.lanAddresses, address])],
      },
    });
    const configured = this.configure(updated);
    if (this.batch !== null) this.pending = true;
    this.writing = this.writing
      .then(async (): Promise<void> => {
        if (this.configuration === configured) await this.store.write(configured);
      })
      .catch((cause: unknown) => {
        this.options.log.error('route.persistence_failed', cause);
      });
    void this.refresh().catch((cause: unknown) => {
      this.options.log.error('route.refresh_failed', cause);
    });
  }
  ownsCredential(value: unknown): boolean {
    return value === undefined || value === null || value === `Bearer ${this.options.token}`;
  }
  lease(
    canonical: string,
    binding?: NativeHubCredentialBinding,
    generation?: number,
  ): {
    readonly url: URL;
    readonly agent: Agent | undefined;
    readonly signal: AbortSignal;
    readonly generation: number;
  } {
    if (this.stopped || this.stateValue.endpoint === null)
      throw new HubTransportError('Hub route is not currently reachable');
    const input = this.validateLease(canonical, binding, generation);
    input.host = new URL(this.stateValue.endpoint.url).host;
    input.protocol = new URL(this.stateValue.endpoint.url).protocol;
    const transport =
      this.configuration === null
        ? { url: input, agent: undefined }
        : this.policies.lease(this.configuration.trust.scopeId, input.href);
    return { ...transport, signal: this.scope.signal, generation: this.stateValue.routeGeneration };
  }
  private validateLease(
    canonical: string,
    binding: NativeHubCredentialBinding | undefined,
    generation: number | undefined,
  ): URL {
    const input = new URL(canonical);
    if (
      input.origin !== this.canonical.url ||
      input.username !== '' ||
      input.password !== '' ||
      input.hash !== ''
    )
      throw new HubTransportError('Request does not belong to canonical node hub');
    if (
      binding !== undefined &&
      this.configuration?.bindings.some(
        (entry) => JSON.stringify(entry) === JSON.stringify(binding),
      ) !== true
    )
      throw new HubTransportError('Credential is not enrolled in the node route scope');
    if (generation !== undefined && generation !== this.stateValue.routeGeneration)
      throw new HubTransportError('Node route generation is stale');
    return input;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.probes.abort();
    this.scope.abort(new HubTransportError('Node route authority stopped'));
    this.events.stop();
    this.policies.close();
    this.listeners.clear();
    this.viewListeners.clear();
    await this.writing;
    await this.batch;
  }
}
