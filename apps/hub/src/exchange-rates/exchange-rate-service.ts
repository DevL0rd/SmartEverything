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

  constructor(private readonly options: ExchangeRateServiceOptions) {
    this.fetches = new ScheduledFetch({
      clock: options.clock,
      fetch: (): Promise<ExchangeRatesRow> => this.fetchOnce(),
      retrySeconds: RETRY_SECONDS,
      minGapMs: MIN_GAP_MS,
    });
  }

  start(): void {
    const row = this.current();
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

  current(): ExchangeRatesRow {
    return this.options.store.exchangeRates.read();
  }

  settled(): Promise<ExchangeRatesRow> | null {
    return this.fetches.settled();
  }

  refresh(): Promise<ExchangeRatesRow> {
    const row = this.current();
    return this.fetches.refresh(row, { fetchedAt: row.fetched_at, healthy: row.error === null });
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
    this.fetches.reset();
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
    this.fetches.schedule(next);
    return row;
  }

  private failed(reason: string): ExchangeRatesRow {
    const next = this.fetches.retryAt();
    this.options.log.warn('exchange_rates.fetch_failed', { reason, retryAt: next.toISOString() });
    const row = this.options.store.exchangeRates.failed({
      error: reason,
      nextFetchAt: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }
}
