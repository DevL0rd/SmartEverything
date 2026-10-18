import {
  HUB_PUBLIC_IDENTITY,
  HUB_IDENTITY_PATH,
  HUB_REQUEST_TIMEOUT_MS,
  HUB_ROUTE_PROBE_TIMEOUT_MS,
  type HubConnectionMetadata,
  type HubDiscoveryCandidate,
  type HubEndpoint,
  type NativeHubDiscovery,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { abortFacts, countEvent, failureFacts, nowMs } from './request-log';
import type { HubRouteLease, RouteAuthority, RouteHost } from './active-route';
import {
  clearRouteTrust,
  configureRouteTrust,
  deadline,
  hubFetch,
  hubNetwork,
} from './route-platform';
import {
  HubRouteUnavailableError,
  trustOf,
  trustedBootstrap,
  usableEndpoints,
} from './route-policy';

const log = new Logger('app.hub-route');

async function probeHubEndpoint(
  scopeId: string,
  endpoint: HubEndpoint,
  metadata: HubConnectionMetadata,
  outer: AbortSignal,
): Promise<boolean> {
  const limit = deadline(HUB_ROUTE_PROBE_TIMEOUT_MS, outer);
  const startedAt = nowMs();
  try {
    const response = await hubFetch(scopeId, endpoint, `${endpoint.url}${HUB_IDENTITY_PATH}`, {
      method: 'GET',
      signal: limit.signal,
    });
    if (!response.ok) {
      log.debug('route.probe_refused', () => ({
        kind: endpoint.kind,
        status: response.status,
        elapsedMs: nowMs() - startedAt,
      }));
      return false;
    }
    const answer = HUB_PUBLIC_IDENTITY.parse(await response.json());
    const matches =
      answer.identity.id === metadata.identity.id &&
      answer.identity.tls.serverName === metadata.identity.tls.serverName;
    log.debug('route.probe_answered', () => ({
      kind: endpoint.kind,
      matches,
      elapsedMs: nowMs() - startedAt,
    }));
    return matches;
  } catch (error) {
    log.debug('route.probe_failed', () => ({
      kind: endpoint.kind,
      elapsedMs: nowMs() - startedAt,
      timedOut: limit.signal.aborted && !outer.aborted,
      ...abortFacts(outer),
      ...failureFacts(error),
    }));
    return false;
  } finally {
    limit.clear();
  }
}

function sameCandidates(
  left: readonly HubDiscoveryCandidate[],
  right: readonly HubDiscoveryCandidate[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (candidate, index) =>
        candidate.url === right[index]?.url && candidate.hubId === right[index].hubId,
    )
  );
}

export class ProbingRouteAuthority implements RouteAuthority {
  private stopped = false;
  private probing: Promise<void> | null = null;
  private run = 0;
  private queued = false;
  private cancel = new AbortController();
  private unsubscribe: (() => void) | null = null;
  private configured = false;
  private readiness: Promise<void> | null = null;
  private discovering = false;
  private epoch = 0;

  constructor(private readonly host: RouteHost) {}

  start(): void {
    log.info('route.probing_started', {
      scopeId: this.host.scopeId.slice(0, 8),
      skipped: this.unsubscribe !== null || this.stopped,
    });
    if (this.unsubscribe !== null || this.stopped) return;
    this.unsubscribe = hubNetwork().subscribeDiscovery((discovery) => {
      this.applyDiscovery(discovery);
    });
    this.discover();
    this.refresh();
  }

  stop(): void {
    log.info('route.probing_stopped', {
      scopeId: this.host.scopeId.slice(0, 8),
      probing: this.probing !== null,
      run: this.run,
    });
    this.stopped = true;
    this.run += 1;
    this.cancel.abort();
    this.unsubscribe?.();
    this.unsubscribe = null;
    void hubNetwork()
      .stopDiscovery()
      .catch((error: unknown) => {
        log.warn('route.discovery_stop_failed', failureFacts(error));
      });
    if (hubNetwork().capabilities.http)
      background(clearRouteTrust(this.host.scopeId), 'route_trust.clear_failed');
  }

  ready(): Promise<void> {
    return (this.readiness ??= this.prepareInitialRoute());
  }

  invalidate(): void {
    this.epoch += 1;
    this.host.publish({ generation: this.host.current().generation + 1 });
  }

  update(metadata: HubConnectionMetadata): void {
    this.host.publish({ metadata });
    this.refresh();
  }

  lease(): HubRouteLease {
    const endpoint = this.host.current().endpoint;
    if (endpoint === null || this.stopped || (endpoint.kind === 'lan' && !this.configured))
      throw new HubRouteUnavailableError("Can't do this on this connection. Try again.");
    const epoch = this.epoch;
    return this.host.lease(
      endpoint,
      () => !this.stopped && epoch === this.epoch && (endpoint.kind !== 'lan' || this.configured),
      () => {
        this.refresh(false);
      },
    );
  }

  discover(): void {
    if (this.stopped || this.discovering) {
      countEvent('route.discover_skipped');
      return;
    }
    this.discovering = true;
    log.debug('route.discovery_started', () => ({ scopeId: this.host.scopeId.slice(0, 8) }));
    background(
      hubNetwork()
        .startDiscovery()
        .then((discovery) => {
          log.debug('route.discovery_answered', {
            state: discovery.state,
            candidates: discovery.candidates.length,
            stopped: this.stopped,
          });
          if (!this.stopped) this.applyDiscovery(discovery);
        })
        .catch((error: unknown) => {
          log.warn('route.discovery_failed', failureFacts(error));
        })
        .finally(() => {
          this.discovering = false;
        }),
      'discovery.start_failed',
    );
  }

  refresh(supersede = true): void {
    if (this.stopped) return;
    if (this.probing !== null) {
      countEvent(supersede ? 'route.refresh_superseding' : 'route.refresh_coalesced');
      if (supersede) {
        this.queued = true;
        this.run += 1;
        this.cancel.abort();
      }
      return;
    }
    this.cancel = new AbortController();
    const run = ++this.run;
    const startedAt = nowMs();
    log.debug('route.probe_run_started', () => ({
      scopeId: this.host.scopeId.slice(0, 8),
      run,
      supersede,
    }));
    const task = this.resolve(run, this.cancel.signal)
      .then(() => {
        log.debug('route.probe_run_finished', () => ({
          run,
          current: this.isCurrent(run),
          elapsedMs: nowMs() - startedAt,
        }));
      })
      .catch((error: unknown) => {
        log.warn('route.probe_run_failed', {
          run,
          current: this.isCurrent(run),
          elapsedMs: nowMs() - startedAt,
          ...failureFacts(error),
        });
        if (this.isCurrent(run))
          this.host.publish({
            problem: error instanceof Error ? error.message : "Couldn't verify your home.",
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

  private applyDiscovery(discovery: NativeHubDiscovery): void {
    const previous = this.host.current().discovery;
    this.host.publish({ discovery });
    if (!sameCandidates(previous?.candidates ?? [], discovery.candidates)) this.refresh();
  }

  private async prepareInitialRoute(): Promise<void> {
    if (!hubNetwork().capabilities.http) return;
    this.refresh(false);
    let complete: () => void = () => undefined;
    const expired = new Promise<void>((resolve) => {
      complete = resolve;
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      complete();
    }, HUB_REQUEST_TIMEOUT_MS + HUB_ROUTE_PROBE_TIMEOUT_MS);
    const startedAt = nowMs();
    try {
      await Promise.race([this.settle(), expired]);
    } finally {
      clearTimeout(timer);
      log.debug('route.initial_ready', () => ({ timedOut, waitedMs: nowMs() - startedAt }));
    }
  }

  private async settle(): Promise<void> {
    while (this.probing !== null && !this.stopped) await this.probing;
  }

  private isCurrent(run: number): boolean {
    return run === this.run && !this.stopped;
  }

  private async resolve(run: number, signal: AbortSignal): Promise<void> {
    const { canonical, connection, scopeId } = this.host;
    if (!trustedBootstrap(canonical.url) && connection.trustedMetadata === undefined) {
      log.info('route.probe_skipped', { run, reason: 'untrusted_bootstrap_without_metadata' });
      return;
    }
    const metadata = await this.host.metadata();
    if (!this.isCurrent(run)) return;
    const inventory = this.inventory(metadata);
    const problem = await this.configure(inventory);
    if (!this.isCurrent(run)) return;
    const candidates = usableEndpoints(inventory, canonical).filter(
      (endpoint) => endpoint.kind !== 'lan' || problem === null,
    );
    log.debug('route.probe_candidates', () => ({
      run,
      candidates: candidates.map((endpoint) => endpoint.kind).join(','),
      lanHeldBack: problem !== null,
      trustProblem: problem === null ? null : problem.slice(0, 120),
    }));
    const answers = await Promise.all(
      candidates.map(async (endpoint) => ({
        endpoint,
        reachable: await probeHubEndpoint(scopeId, endpoint, metadata, signal),
      })),
    );
    if (!this.isCurrent(run)) return;
    const selected = answers.find((answer) => answer.reachable)?.endpoint;
    log.debug('route.probe_results', () => ({
      run,
      answers: answers
        .map((answer) => `${answer.endpoint.kind}:${String(answer.reachable)}`)
        .join(','),
    }));
    if (selected === undefined) {
      log.warn('route.none_reachable', { run, tried: candidates.length });
      this.discover();
      throw new HubRouteUnavailableError(
        "Your home didn't answer. Check that Home Hub is running and on your network.",
      );
    }
    this.select(selected, problem);
  }

  private select(selected: HubEndpoint, problem: string | null): void {
    const current = this.host.current();
    if (current.endpoint?.url === selected.url) this.host.publish({ problem });
    else {
      this.host.publish({ endpoint: selected, generation: current.generation + 1, problem });
      log.info('route.selected', {
        kind: selected.kind,
        fromKind: current.endpoint?.kind ?? 'none',
        generation: current.generation + 1,
        reason: 'first_reachable_candidate',
        trustProblem: problem === null ? null : problem.slice(0, 120),
      });
    }
    this.host.connected(selected);
  }

  private inventory(metadata: HubConnectionMetadata): HubConnectionMetadata {
    const discovered = this.host.current().discovery?.candidates ?? [];
    const urls = new Set(metadata.endpoints.map((endpoint) => endpoint.url));
    const added: HubEndpoint[] = discovered
      .filter((candidate) => candidate.hubId === metadata.identity.id && !urls.has(candidate.url))
      .map((candidate) => ({ kind: 'lan', url: candidate.url }));
    return { ...metadata, endpoints: [...metadata.endpoints, ...added] };
  }

  private async configure(inventory: HubConnectionMetadata): Promise<string | null> {
    if (
      !hubNetwork().capabilities.http ||
      !inventory.endpoints.some((endpoint) => endpoint.kind === 'lan')
    )
      return null;
    try {
      await configureRouteTrust(trustOf(this.host.scopeId, inventory));
      if (this.stopped) {
        await clearRouteTrust(this.host.scopeId);
        return 'This connection was replaced. Reconnect to continue.';
      }
      this.configured = true;
      return null;
    } catch (error) {
      this.configured = false;
      return error instanceof Error ? error.message : 'Native pin transport is unavailable.';
    }
  }
}
