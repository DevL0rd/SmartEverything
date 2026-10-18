import {
  type HubConnectionMetadata,
  type NativeHubCredentialBinding,
  type NativeHubRouteAuthority,
  type NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import type { HubRouteLease, RouteAuthority, RouteHost } from './active-route';
import { hubNetwork, nativeServerActivated, pinnedFetch } from './route-platform';
import { trustOf, HubRouteUnavailableError, StaleHubRouteError } from './route-policy';

import { countEvent, failureFacts, nowMs } from './request-log';
import {
  noteNativeRouteChange,
  noteNativeRequestFailure,
  configureStepLogger,
  noteNativeConfigured,
  noteNativeWait,
  noteNativeStateAccepted,
  noteNativeStateIgnored,
} from './native-route-diagnostics';

const log = new Logger('app.hub-route');
const READINESS_TIMEOUT_MS = 20_000;

export function nativeRouteFacade(host: RouteHost): NativeRouteFacade | null {
  const network = hubNetwork();
  return network.capabilities.routeAuthority === true && network.routeAuthority !== undefined
    ? new NativeRouteFacade(network.routeAuthority, host)
    : null;
}
export class NativeRouteFacade implements RouteAuthority {
  private binding: NativeHubCredentialBinding | null = null;
  private current: NativeHubRouteSnapshot | null = null;
  private metadataValue: HubConnectionMetadata | null = null;
  private operation = 0;
  private configuring = false;
  private queuedState: NativeHubRouteSnapshot | null = null;
  private refreshing: Promise<void> | null = null;
  private stopped = false;
  private readyTask: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly readinessListeners = new Set<() => void>();
  private coalescedRefreshes = 0;
  constructor(
    private readonly authority: NativeHubRouteAuthority,
    private readonly host: RouteHost,
  ) {}
  start(): void {
    this.unsubscribe ??= this.authority.subscribe((state) => {
      if (state.scopeId !== this.host.scopeId || this.stopped) return;
      if (this.configuring) this.queue(state);
      else this.accept(state);
    });
    log.info('route.native_started', { scopeId: this.scopeId(), operation: this.operation });
    const task = this.ready();
    const run = this.operation;
    void task.catch((error: unknown) => {
      log.warn('route.native_start_failed', {
        scopeId: this.scopeId(),
        operation: run,
        current: this.currentOperation(run),
        ...failureFacts(error),
      });
      if (this.currentOperation(run))
        this.host.publish({
          problem:
            error instanceof Error
              ? error.message
              : "Couldn't reach your home. Reconnect and try again.",
        });
    });
  }
  private scopeId(): string {
    return this.host.scopeId.slice(0, 8);
  }
  ready(): Promise<void> {
    if (this.readyTask !== null) {
      countEvent('route.native_ready_shared');
      return this.readyTask.then(() => this.waitReady());
    }
    const task = this.configure().catch((error: unknown) => {
      log.warn('route.native_configure_failed', {
        scopeId: this.scopeId(),
        operation: this.operation,
        ...failureFacts(error),
      });
      if (this.readyTask === task) {
        this.readyTask = null;
        this.configuring = false;
      }
      throw error;
    });
    this.readyTask = task;
    return task.then(() => this.waitReady());
  }
  private waitReady(): Promise<void> {
    if (this.current?.readiness === 'ready' && !this.stopped) return Promise.resolve();
    const startedAt = nowMs();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, outcome = 'ready'): void => {
        clearTimeout(timer);
        this.readinessListeners.delete(changed);
        noteNativeWait(
          this.host.scopeId,
          { outcome, waitedMs: nowMs() - startedAt, error },
          this.current,
        );
        if (error === undefined) resolve();
        else reject(error);
      };
      const changed = (): void => {
        if (this.stopped) finish(new StaleHubRouteError('GET'), 'stopped');
        else if (this.current?.readiness === 'ready') finish();
        else if (this.current?.readiness === 'unavailable')
          finish(new HubRouteUnavailableError(this.current.detail), 'unavailable');
      };
      const timer = setTimeout(() => {
        finish(
          new HubRouteUnavailableError('Your home took too long to answer. Try again.'),
          'timeout',
        );
      }, READINESS_TIMEOUT_MS);
      this.readinessListeners.add(changed);
      changed();
    });
  }
  private async configure(): Promise<void> {
    const run = ++this.operation;
    this.configuring = true;
    const step = configureStepLogger(this.host.scopeId, run, () => this.currentOperation(run));
    const principalId = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      this.host.connection.token,
    );
    step('principal');
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    await nativeServerActivated();
    step('activation');
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    const metadata = await this.host.metadata();
    step('metadata');
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    const binding: NativeHubCredentialBinding = {
      scopeId: this.host.scopeId,
      canonicalOrigin: new URL(this.host.connection.url).origin,
      hubId: metadata.identity.id,
      principalId,
      credentialKind: 'client',
      credentialGeneration: 0,
    };
    this.binding = binding;
    this.metadataValue = metadata;
    this.host.publish({ metadata });
    await this.configureBinding(metadata, binding, run);
    step('configured');
  }
  private currentOperation(
    run: number,
    binding: NativeHubCredentialBinding | null = this.binding,
  ): boolean {
    return !this.stopped && this.operation === run && this.binding === binding;
  }
  private async configureBinding(
    metadata: HubConnectionMetadata,
    binding: NativeHubCredentialBinding,
    run: number,
  ): Promise<void> {
    const startedAt = nowMs();
    const state = await this.authority.configure({
      trust: trustOf(this.host.scopeId, metadata),
      canonicalOrigin: binding.canonicalOrigin,
      bindings: [binding],
    });
    const stale = !this.currentOperation(run, binding);
    noteNativeConfigured(this.host.scopeId, {
      operation: run,
      binding,
      endpoints: metadata.endpoints.length,
      state,
      discarded: stale,
      elapsedMs: nowMs() - startedAt,
    });
    if (stale) return;
    this.configuring = false;
    this.accept(state);
    const queued = this.queuedState;
    this.queuedState = null;
    if (queued !== null) this.accept(queued);
  }
  private queue(state: NativeHubRouteSnapshot): void {
    const queued = this.queuedState;
    if (
      queued === null ||
      state.networkGeneration > queued.networkGeneration ||
      (state.networkGeneration === queued.networkGeneration &&
        state.routeGeneration >= queued.routeGeneration)
    ) {
      this.queuedState = state;
      log.debug('route.native_state_queued', () => ({
        scopeId: this.scopeId(),
        readiness: state.readiness,
        routeGeneration: state.routeGeneration,
        networkGeneration: state.networkGeneration,
      }));
    }
  }
  private outdated(state: NativeHubRouteSnapshot): boolean {
    const current = this.current;
    return (
      current !== null &&
      (state.networkGeneration < current.networkGeneration ||
        (state.networkGeneration === current.networkGeneration &&
          state.routeGeneration < current.routeGeneration))
    );
  }
  private accept(state: NativeHubRouteSnapshot): void {
    if (this.outdated(state)) {
      noteNativeStateIgnored(this.host.scopeId, state, this.current);
      return;
    }
    const changed =
      this.current?.routeGeneration !== state.routeGeneration ||
      this.current.readiness !== state.readiness;
    noteNativeStateAccepted(this.host.scopeId, {
      previous: this.current,
      state,
      changed,
      listeners: this.readinessListeners.size,
    });
    noteNativeRouteChange(this.current, state);
    this.current = state;
    this.host.publish({
      ...(state.readiness === 'ready' ? { endpoint: state.endpoint } : {}),
      ...(changed ? { generation: this.host.current().generation + 1 } : {}),
      problem: state.detail === '' ? null : state.detail,
    });
    this.readinessListeners.forEach((listener) => {
      listener();
    });
    if (state.readiness === 'ready') this.host.connected(state.endpoint);
  }
  invalidate(): void {
    const binding = this.binding;
    const metadata = this.metadataValue;
    log.info('route.native_invalidated', {
      scopeId: this.scopeId(),
      skipped: binding === null || metadata === null || this.stopped,
      credentialGeneration: binding?.credentialGeneration ?? null,
    });
    if (binding === null || metadata === null || this.stopped) return;
    this.binding = { ...binding, credentialGeneration: binding.credentialGeneration + 1 };
    this.current = null;
    this.queuedState = null;
    this.host.publish({ endpoint: null, generation: this.host.current().generation + 1 });
    this.reconfigure(metadata, this.binding);
  }
  update(metadata: HubConnectionMetadata): void {
    log.info('route.native_metadata_updated', {
      scopeId: this.scopeId(),
      endpoints: metadata.endpoints.length,
      skipped: this.binding === null || this.stopped,
    });
    if (this.binding === null || this.stopped) return;
    this.metadataValue = metadata;
    this.host.publish({ metadata });
    this.reconfigure(metadata, this.binding);
  }
  private reconfigure(metadata: HubConnectionMetadata, binding: NativeHubCredentialBinding): void {
    const run = ++this.operation;
    this.configuring = true;
    this.readyTask = this.configureBinding(metadata, binding, run);
    void this.readyTask.catch((error: unknown) => {
      log.warn('route.native_reconfigure_failed', {
        scopeId: this.scopeId(),
        operation: run,
        current: this.currentOperation(run, binding),
        ...failureFacts(error),
      });
      if (this.currentOperation(run, binding)) {
        this.configuring = false;
        this.host.publish({
          problem: error instanceof Error ? error.message : 'Native profile binding failed.',
        });
      }
    });
  }

  refresh(): void {
    if (this.stopped || this.binding === null) {
      log.debug('route.refresh_skipped', () => ({
        scopeId: this.scopeId(),
        stopped: this.stopped,
      }));
      return;
    }
    if (this.refreshing !== null) {
      this.coalescedRefreshes += 1;
      countEvent('route.refresh_coalesced');
      return;
    }
    const run = this.operation;
    const binding = this.binding;
    const startedAt = nowMs();
    log.debug('route.refresh_started', () => ({
      scopeId: this.scopeId(),
      operation: run,
      routeGeneration: this.current?.routeGeneration ?? null,
    }));
    this.refreshing = this.authority
      .refresh(this.host.scopeId)
      .then((state) => {
        const applied = this.currentOperation(run, binding) && !this.configuring;
        log.debug('route.refresh_finished', () => ({
          scopeId: this.scopeId(),
          applied,
          configuring: this.configuring,
          readiness: state.readiness,
          routeGeneration: state.routeGeneration,
          coalesced: this.coalescedRefreshes,
          elapsedMs: nowMs() - startedAt,
        }));
        if (applied) this.accept(state);
      })
      .catch((error: unknown) => {
        log.warn('route.refresh_failed', {
          scopeId: this.scopeId(),
          coalesced: this.coalescedRefreshes,
          elapsedMs: nowMs() - startedAt,
          ...failureFacts(error),
        });
      })
      .finally(() => {
        this.refreshing = null;
        this.coalescedRefreshes = 0;
      });
  }
  lease(): HubRouteLease {
    const state = this.current;
    const binding = this.binding;
    if (state?.readiness !== 'ready' || binding === null || this.stopped)
      throw new HubRouteUnavailableError('Still connecting to your home…');
    const isCurrent = (): boolean => !this.stopped && binding === this.binding;
    return {
      ...this.host.lease(state.endpoint, isCurrent, () => {
        this.refresh();
      }),
      binding,
      nativeRouteGeneration: state.routeGeneration,
      nativeNetworkGeneration: state.networkGeneration,
      nativeAuthority: true,
      fetch: (url, init): Promise<Response> => {
        if (!isCurrent()) throw new StaleHubRouteError(init.method ?? 'GET');
        return this.fetch(state, binding, url, init);
      },
    };
  }
  private async fetch(
    state: NativeHubRouteSnapshot,
    binding: NativeHubCredentialBinding,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const startedAt = performance.now();
    try {
      return await pinnedFetch(this.host.scopeId, url, init, {
        binding,
        routeGeneration: state.routeGeneration,
      });
    } catch (error) {
      noteNativeRequestFailure({
        error,
        url,
        method: init.method ?? 'GET',
        elapsedMs: Math.round(performance.now() - startedAt),
        started: state,
        current: this.current,
      });
      throw error;
    }
  }
  stop(): void {
    log.info('route.native_stopped', {
      scopeId: this.scopeId(),
      pendingWaiters: this.readinessListeners.size,
      routeGeneration: this.current?.routeGeneration ?? null,
    });
    this.stopped = true;
    this.readinessListeners.forEach((listener) => {
      listener();
    });
    this.operation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.authority.clear(this.host.scopeId).catch((error: unknown) => {
      log.warn('route.clear_failed', { scopeId: this.scopeId(), ...failureFacts(error) });
    });
  }
}
