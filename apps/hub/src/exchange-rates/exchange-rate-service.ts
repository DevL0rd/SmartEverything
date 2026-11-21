import type { ExchangeRatesRow } from '@smarteverything/domain';
import { RATES_FRESH_MS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { ProviderRequest } from '../outbound/provider-json';
import { ScheduledFetch } from '../scheduled-fetch';
import type { Store } from '../store/store';
import { fetchRates } from './frankfurter';
import { DAY_MS, MINUTE_MS } from '../metrics/minute';
import { background, messageOf } from '@smarteverything/logging';

const DAILY_SLOT_UTC_MINUTES = 17 * 60 + 30;
const MIN_GAP_MS = MINUTE_MS;
const RETRY_SECONDS = [60, 300, 900, 3600] as const;

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

export class ExchangeRateService {
  private readonly fetches: ScheduledFetch<ExchangeRatesRow>;
  private resuming: Promise<void> = Promise.resolve();

  constructor(private readonly options: ExchangeRateServiceOptions) {
    this.fetches = new ScheduledFetch({
      clock: options.clock,
      fetch: (): Promise<ExchangeRatesRow> => this.fetchOnce(),
      retrySeconds: RETRY_SECONDS,
      minGapMs: MIN_GAP_MS,
    });
  }

  start(): void {
    this.resuming = this.resume();
    background(this.resuming, 'exchange_rates.resume_failed');
  }

  private async resume(): Promise<void> {
    const row = await this.current();
    const now = this.options.clock.now().getTime();
    const fresh = row.fetched_at !== null && now - Date.parse(row.fetched_at) < RATES_FRESH_MS;
    if (!fresh) {
      background(this.fetches.run(), 'fetches.run_failed');
      return;
    }
    const due = row.next_fetch_at === null ? 0 : Date.parse(row.next_fetch_at);
    this.fetches.schedule(due > now ? new Date(due) : nextDailySlot(this.options.clock.now()));
  }

  stop(): void {
    this.fetches.cancel();
  }

  current(): Promise<ExchangeRatesRow> {
    return this.options.store.host.call('exchangeRates', 'read');
  }

  async settled(): Promise<ExchangeRatesRow | null> {
    await this.resuming;
    return this.fetches.settled();
  }

  async refresh(): Promise<ExchangeRatesRow> {
    const row = await this.current();
    return this.fetches.refresh(row, { fetchedAt: row.fetched_at, healthy: row.error === null });
  }

  private async fetchOnce(): Promise<ExchangeRatesRow> {
    try {
      const fetched = await fetchRates(this.options.request);
      return await this.fetched(fetched.rates, fetched.rateDate);
    } catch (cause) {
      return await this.failed(messageOf(cause));
    }
  }

  private async fetched(
    rates: Readonly<Record<string, number>>,
    rateDate: string,
  ): Promise<ExchangeRatesRow> {
    this.fetches.reset();
    const next = nextDailySlot(this.options.clock.now());
    const row = await this.options.store.host.call('exchangeRates', 'fetched', {
      rates,
      rateDate,
      nextFetchAt: next.toISOString(),
    });
    this.options.log.info('exchange_rates.fetched', {
      rateDate,
      currencies: Object.keys(rates).length,
      next: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }

  private async failed(reason: string): Promise<ExchangeRatesRow> {
    const next = this.fetches.retryAt();
    this.options.log.warn('exchange_rates.fetch_failed', { reason, retryAt: next.toISOString() });
    const row = await this.options.store.host.call('exchangeRates', 'failed', {
      error: reason,
      nextFetchAt: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }
}
