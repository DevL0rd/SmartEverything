import type {
  AdGuardConnection,
  AdGuardFilter,
  AdGuardSnapshot,
  AdGuardStats,
  AdGuardStatus,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PolledLoop, type Cadence } from '../polled-loop';
import { AdGuardRefusedError, reasonOf, type AdGuardClient } from './adguard-client';
import { CLIENTS_REPLY, FILTERING_REPLY, STATS_REPLY, STATUS_REPLY } from './api-schemas';
import { clientNames, filtersOf, statsOf, statusOf } from './readings';

const FAST_SECONDS = 10;
const SLOW_SECONDS = 60;
const FULL_EVERY = 6;

export interface MonitorOptions {
  readonly client: AdGuardClient;
  readonly url: string;
  readonly log: Logger;
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
  #tick = 0;
  readonly #loop = new PolledLoop({
    fastSeconds: FAST_SECONDS,
    slowSeconds: SLOW_SECONDS,
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
      this.options.publish(this.latest);
    }
  }

  refresh(): void {
    this.#tick = 0;
    this.#loop.runNow();
  }

  stop(): void {
    this.#loop.stop();
  }

  async #readOnce(): Promise<void> {
    const full = this.#tick % FULL_EVERY === 0 || this.#loop.cadence === 'slow';
    this.#tick += 1;
    try {
      if (full) {
        await this.#readSlowParts();
      }
      await this.#readStatusAndStats();
      this.#connection = { state: 'online' };
    } catch (error) {
      this.#fail(error);
    }
    this.options.publish(this.latest);
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

  async #readStatusAndStats(): Promise<void> {
    const client = this.options.client;
    const [status, stats] = await Promise.all([
      client.read('/control/status', STATUS_REPLY),
      client.read('/control/stats', STATS_REPLY),
    ]);
    const next = statusOf(status, new Date());
    const previous = this.#status;
    this.#status = next;
    this.#stats = statsOf(stats, this.#names);
    if (previous !== null && previous.protection !== next.protection) {
      this.options.protectionChanged(next);
    }
  }

  #fail(error: unknown): void {
    const reason = reasonOf(error);
    if (error instanceof AdGuardRefusedError) {
      this.#connection = { state: 'refused', reason };
      return;
    }
    if (this.#connection.state !== 'unreachable') {
      this.options.log.warn('adguard.unreachable', { reason });
      this.#connection = { state: 'unreachable', reason, since: new Date().toISOString() };
    }
  }
}
