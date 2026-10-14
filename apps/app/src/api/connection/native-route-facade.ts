import {
  type HubConnectionMetadata,
  type NativeHubCredentialBinding,
  type NativeHubRouteAuthority,
  type NativeHubRouteSnapshot,
} from '@smarteverything/domain';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';
import type { ServerConnection } from './storage';
import type { ActiveHubRoute, HubRouteLease, HubRouteState } from './active-route';
import { claimNativeServerEnrollment } from '../../../modules/health-connect/src/hub-network';
import { hubNetwork, pinnedFetch } from './route-platform';
import { trustOf, HubRouteUnavailableError, StaleHubRouteError } from './route-policy';

const log = new Logger('app.hub-route');

export interface NativeRouteFacadeOptions {
  readonly connection: ServerConnection;
  readonly scopeId: string;
  readonly metadata: () => Promise<HubConnectionMetadata>;
  readonly publish: (update: Partial<HubRouteState>) => void;
}
export function nativeRouteFacade(
  manager: ActiveHubRoute,
  metadata: () => Promise<HubConnectionMetadata>,
): NativeRouteFacade | null {
  const network = hubNetwork();
  return network.capabilities.routeAuthority === true && network.routeAuthority !== undefined
    ? new NativeRouteFacade(network.routeAuthority, {
        connection: manager.connection,
        scopeId: manager.scopeId,
        metadata,
        publish: (update): void => {
          manager.state.set({ ...manager.state.get(), ...update });
        },
      })
    : null;
}
export class NativeRouteFacade {
  private binding: NativeHubCredentialBinding | null = null;
  private current: NativeHubRouteSnapshot | null = null;
  private metadataValue: HubConnectionMetadata | null = null;
  private version = 0;
  private operation = 0;
  private configuring = false;
  private queuedState: NativeHubRouteSnapshot | null = null;
  private stopped = false;
  private readyTask: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  constructor(
    private readonly authority: NativeHubRouteAuthority,
    private readonly options: NativeRouteFacadeOptions,
  ) {}
  start(): void {
    this.unsubscribe ??= this.authority.subscribe((state) => {
      if (state.scopeId !== this.options.scopeId || this.stopped) return;
      if (this.configuring) this.queue(state);
      else this.accept(state);
    });
    const task = this.ready();
    const run = this.operation;
    void task.catch((error: unknown) => {
      if (this.currentOperation(run))
        this.options.publish({
          problem: error instanceof Error ? error.message : 'Native route failed.',
        });
    });
  }
  ready(): Promise<void> {
    if (this.readyTask !== null) return this.readyTask;
    const task = this.configure().catch((error: unknown) => {
      if (this.readyTask === task) {
        this.readyTask = null;
        this.configuring = false;
      }
      throw error;
    });
    this.readyTask = task;
    return task;
  }
  private async configure(): Promise<void> {
    const run = ++this.operation;
    this.configuring = true;
    const principalId = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      this.options.connection.token,
    );
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    await claimNativeServerEnrollment(
      this.options.scopeId,
      this.options.connection.url,
      principalId,
    );
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    const metadata = await this.options.metadata();
    if (!this.currentOperation(run)) throw new StaleHubRouteError('GET');
    const binding: NativeHubCredentialBinding = {
      scopeId: this.options.scopeId,
      canonicalOrigin: new URL(this.options.connection.url).origin,
      hubId: metadata.identity.id,
      principalId,
      credentialKind: 'client',
      credentialGeneration: 0,
    };
    this.binding = binding;
    this.metadataValue = metadata;
    this.options.publish({ metadata });
    await this.configureBinding(metadata, binding, run);
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
    const state = await this.authority.configure({
      trust: trustOf(this.options.scopeId, metadata),
      canonicalOrigin: binding.canonicalOrigin,
      bindings: [binding],
    });
    if (!this.currentOperation(run, binding)) return;
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
    )
      this.queuedState = state;
  }
  private accept(state: NativeHubRouteSnapshot): void {
    if (
      this.current !== null &&
      (state.networkGeneration < this.current.networkGeneration ||
        (state.networkGeneration === this.current.networkGeneration &&
          state.routeGeneration < this.current.routeGeneration))
    )
      return;
    if (
      this.current?.routeGeneration !== state.routeGeneration ||
      this.current.readiness !== state.readiness
    )
      this.version += 1;
    this.current = state;
    this.options.publish({
      endpoint: state.readiness === 'ready' ? state.endpoint : null,
      generation: this.version,
      problem: state.detail === '' ? null : state.detail,
    });
  }
  invalidate(): void {
    const binding = this.binding;
    const metadata = this.metadataValue;
    if (binding === null || metadata === null || this.stopped) return;
    this.binding = { ...binding, credentialGeneration: binding.credentialGeneration + 1 };
    this.current = null;
    this.queuedState = null;
    this.version += 1;
    this.options.publish({ endpoint: null, generation: this.version });
    const run = ++this.operation;
    const next = this.binding;
    this.configuring = true;
    this.readyTask = this.configureBinding(metadata, next, run);
    void this.readyTask.catch((error: unknown) => {
      if (this.currentOperation(run, next)) {
        this.configuring = false;
        this.options.publish({
          problem: error instanceof Error ? error.message : 'Native profile binding failed.',
        });
      }
    });
  }

  refresh(): void {
    if (this.stopped || this.binding === null) return;
    const run = this.operation;
    const binding = this.binding;
    void this.authority
      .refresh(this.options.scopeId)
      .then((state) => {
        if (this.currentOperation(run, binding) && !this.configuring) this.accept(state);
      })
      .catch((error: unknown) => {
        log.warn('route.refresh_failed', {
          failure: error instanceof Error ? error.name : 'NativeFailure',
        });
      });
  }
  lease(): HubRouteLease {
    const state = this.current;
    const binding = this.binding;
    if (state?.readiness !== 'ready' || binding === null || this.stopped)
      throw new HubRouteUnavailableError('Native hub routes are still being verified.');
    const isCurrent = (): boolean =>
      !this.stopped &&
      this.current?.readiness === 'ready' &&
      state.routeGeneration === this.current.routeGeneration &&
      binding === this.binding;
    return {
      baseUrl: state.endpoint.url,
      scopeId: this.options.scopeId,
      generation: this.version,
      endpoint: state.endpoint,
      binding,
      nativeRouteGeneration: state.routeGeneration,
      nativeAuthority: true,
      fetch: (url, init): Promise<Response> => {
        if (!isCurrent()) throw new StaleHubRouteError(init.method ?? 'GET');
        return pinnedFetch(this.options.scopeId, url, init, {
          binding,
          routeGeneration: state.routeGeneration,
        });
      },
      isCurrent,
      failed: (): void => undefined,
    };
  }
  stop(): void {
    this.stopped = true;
    this.operation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    void this.authority.clear(this.options.scopeId).catch((error: unknown) => {
      log.warn('route.clear_failed', {
        failure: error instanceof Error ? error.name : 'NativeFailure',
      });
    });
  }
}
