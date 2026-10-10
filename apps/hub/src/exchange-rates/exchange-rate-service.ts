import type { ExchangeRatesRow } from '@smarteverything/domain';
import { RATES_FRESH_MS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { ProviderRequest } from '../outbound/provider-json';
import type { Store } from '../store/store';
import { fetchRates } from './frankfurter';

const MINUTE_MS = 60_000;
const DAILY_SLOT_UTC_MINUTES = 17 * 60 + 30;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MIN_GAP_MS = MINUTE_MS;
const RETRY_SECONDS = [60, 300, 900, 3600] as const;
const LONGEST_RETRY_SECONDS = 3600;

export interface ExchangeRateServiceOptions {
  readonly store: Store;
  readonly request: ProviderRequest;
  readonly clock: Clock;
  readonly log: Logger;
}

export function nextDailySlot(now: Date): Date {
  const midnight = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  const today = midnight + DAILY_SLOT_UTC_MINUTES * MINUTE_MS;
  return new Date(today > now.getTime() ? today : today + DAY_MS);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class ExchangeRateService {
  private timer: Cancel | null = null;
  private running: Promise<ExchangeRatesRow> | null = null;
  private failures = 0;

  constructor(private readonly options: ExchangeRateServiceOptions) {}

  start(): void {
    const row = this.current();
    const now = this.options.clock.now().getTime();
    const fresh = row.fetched_at !== null && now - Date.parse(row.fetched_at) < RATES_FRESH_MS;
    if (!fresh) {
      void this.fetchNow();
      return;
    }
    const due = row.next_fetch_at === null ? 0 : Date.parse(row.next_fetch_at);
    this.schedule(due > now ? new Date(due) : nextDailySlot(this.options.clock.now()));
  }

  stop(): void {
    this.cancel();
  }

  current(): ExchangeRatesRow {
    return this.options.store.exchangeRates.read();
  }

  settled(): Promise<ExchangeRatesRow> | null {
    return this.running;
  }

  refresh(): Promise<ExchangeRatesRow> {
    if (this.running !== null) {
      return this.running;
    }
    const row = this.current();
    const recent =
      row.error === null &&
      row.fetched_at !== null &&
      this.options.clock.now().getTime() - Date.parse(row.fetched_at) < MIN_GAP_MS;
    return recent ? Promise.resolve(row) : this.fetchNow();
  }

  private schedule(at: Date): void {
    this.cancel();
    this.timer = this.options.clock.at(at, () => {
      this.timer = null;
      void this.fetchNow();
    });
  }

  private cancel(): void {
    this.timer?.();
    this.timer = null;
  }

  private fetchNow(): Promise<ExchangeRatesRow> {
    if (this.running !== null) {
      return this.running;
    }
    const running = this.fetchOnce().finally(() => {
      this.running = null;
    });
    this.running = running;
    return running;
  }

  private async fetchOnce(): Promise<ExchangeRatesRow> {
    try {
      const fetched = await fetchRates(this.options.request);
      return this.fetched(fetched.rates, fetched.rateDate);
    } catch (cause) {
      return this.failed(messageOf(cause));
    }
  }

  private fetched(rates: Readonly<Record<string, number>>, rateDate: string): ExchangeRatesRow {
    this.failures = 0;
    const next = nextDailySlot(this.options.clock.now());
    const row = this.options.store.exchangeRates.fetched({
      rates,
      rateDate,
      nextFetchAt: next.toISOString(),
    });
    this.options.log.info('exchange_rates.fetched', {
      rateDate,
      currencies: Object.keys(rates).length,
      next: next.toISOString(),
    });
    this.schedule(next);
    return row;
  }

  private failed(reason: string): ExchangeRatesRow {
    const seconds = RETRY_SECONDS[this.failures] ?? LONGEST_RETRY_SECONDS;
    this.failures += 1;
    const next = new Date(this.options.clock.now().getTime() + seconds * 1000);
    this.options.log.warn('exchange_rates.fetch_failed', { reason, retryAt: next.toISOString() });
    const row = this.options.store.exchangeRates.failed({
      error: reason,
      nextFetchAt: next.toISOString(),
    });
    this.schedule(next);
    return row;
  }
}
