import type {
  AdGuardConnection,
  AdGuardFilter,
  AdGuardSnapshot,
  AdGuardStats,
  AdGuardStatus,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PolledLoop, type Cadence } from '../polled-loop';
import { JsonApiRefusedError, reasonOf } from '../json-api';
import { WireGate } from '../wire-gate';
import type { AdGuardClient } from './adguard-client';
import { CLIENTS_REPLY, FILTERING_REPLY, STATS_REPLY, STATUS_REPLY } from './api-schemas';
import { LookupRates, type LookupRate } from './lookup-rates';
import { clientNames, filtersOf, statsOf, statusOf } from './readings';

const SAMPLE_SECONDS = 1;
const STATUS_MS = 10_000;
const FULL_MS = 60_000;
const WIRE_QUIET_MS = 60_000;

export interface MonitorOptions {
  readonly client: AdGuardClient;
  readonly url: string;
  readonly log: Logger;
  readonly record: (snapshot: AdGuardSnapshot, rate: LookupRate | null) => void;
  readonly publish: (snapshot: AdGuardSnapshot) => void;
  readonly protectionChanged: (status: AdGuardStatus) => void;
}

export class AdGuardMonitor {
  #connection: AdGuardConnection = { state: 'connecting' };
  #status: AdGuardStatus | null = null;
  #stats: AdGuardStats | null = null;
  #filters: AdGuardFilter[] = [];
  #rules: string[] = [];
  #names: ReadonlyMap<string, string> = new Map();
  #statusAt = 0;
  #fullAt = 0;
  readonly #rates = new LookupRates();
  readonly #wire = new WireGate(WIRE_QUIET_MS);
  readonly #loop = new PolledLoop({
    sampleSeconds: SAMPLE_SECONDS,
    tick: (): Promise<void> => this.#readOnce(),
  });

  constructor(private readonly options: MonitorOptions) {}

  get client(): AdGuardClient {
    return this.options.client;
  }

  get latest(): AdGuardSnapshot {
    return {
      at: new Date().toISOString(),
      url: this.options.url,
      connection: this.#connection,
      cadence: this.#loop.cadence,
      intervalSeconds: this.#loop.intervalSeconds,
      status: this.#status,
      stats: this.#stats,
      filters: this.#filters,
      userRules: this.#rules,
    };
  }

  setCadence(cadence: Cadence): void {
    this.#loop.setCadence(cadence);
    if (cadence === 'paused') {
      this.#connection = { state: 'paused' };
      this.options.record(this.latest, null);
      this.options.publish(this.latest);
    }
  }

  refresh(): void {
    this.#statusAt = 0;
    this.#fullAt = 0;
    this.#loop.runNow();
  }

  stop(): void {
    this.#loop.stop();
  }

  async #readOnce(): Promise<void> {
    const now = Date.now();
    const before = this.#connection.state;
    let rate: LookupRate | null = null;
    try {
      if (now - this.#fullAt >= FULL_MS) {
        await this.#readSlowParts();
        this.#fullAt = now;
      }
      rate = await this.#readStatusAndStats(now);
      this.#connection = { state: 'online' };
    } catch (error) {
      this.#rates.reset();
      this.#fail(error);
    }
    const snapshot = this.latest;
    this.options.record(snapshot, rate);
    if (this.#wire.due(this.#loop.viewed, snapshot.connection.state !== before)) {
      this.options.publish(snapshot);
    }
  }

  async #readSlowParts(): Promise<void> {
    const client = this.options.client;
    const [clients, filtering] = await Promise.all([
      client.read('/control/clients', CLIENTS_REPLY),
      client.read('/control/filtering/status', FILTERING_REPLY),
    ]);
    this.#names = clientNames(clients);
    this.#filters = filtersOf(filtering);
    this.#rules = filtering.user_rules ?? [];
  }

  async #readStatusAndStats(now: number): Promise<LookupRate | null> {
    const client = this.options.client;
    const statusDue = now - this.#statusAt >= STATUS_MS;
    const [status, stats] = await Promise.all([
      statusDue ? client.read('/control/status', STATUS_REPLY) : Promise.resolve(null),
      client.read('/control/stats', STATS_REPLY),
    ]);
    if (status !== null) {
      this.#statusAt = now;
      this.#applyStatus(statusOf(status, new Date()));
    }
    this.#stats = statsOf(stats, this.#names);
    return this.#rates.sample(this.#stats.queries, this.#stats.blocked, now);
  }

  #applyStatus(next: AdGuardStatus): void {
    const previous = this.#status;
    this.#status = next;
    if (previous !== null && previous.protection !== next.protection) {
      this.options.protectionChanged(next);
    }
  }

  #fail(error: unknown): void {
    const reason = reasonOf(error);
    if (error instanceof JsonApiRefusedError) {
      this.#connection = { state: 'refused', reason };
      return;
    }
    if (this.#connection.state !== 'unreachable') {
      this.options.log.warn('adguard.unreachable', { reason });
      this.#connection = { state: 'unreachable', reason, since: new Date().toISOString() };
    }
  }
}
