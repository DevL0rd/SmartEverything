import type { SettingsRow, WeatherAir, WeatherRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { ScheduledFetch } from '../scheduled-fetch';
import type { Store } from '../store/store';
import { fetchAir } from './open-meteo-air';
import { fetchForecast } from './open-meteo-forecast';
import type { ProviderRequest } from '../outbound/provider-json';
import type { WeatherSpot } from './open-meteo';
import { MINUTE_MS } from '../metrics/minute';
import { background, messageOf } from '@smarteverything/logging';

const SLOT_PERIOD_MS = 15 * MINUTE_MS;
const SLOT_OFFSET_MS = MINUTE_MS;
const MIN_GAP_MS = 5 * MINUTE_MS;
const RETRY_SECONDS = [15, 300, 900, 2700, 3600] as const;
const FRESH_MS = 2 * MINUTE_MS;

export interface WeatherServiceOptions {
  readonly store: Store;
  readonly request: ProviderRequest;
  readonly clock: Clock;
  readonly log: Logger;
}

function nextSlot(now: Date): Date {
  const earliest = now.getTime() + MIN_GAP_MS - SLOT_OFFSET_MS;
  const slot = (Math.floor(earliest / SLOT_PERIOD_MS) + 1) * SLOT_PERIOD_MS + SLOT_OFFSET_MS;
  return new Date(slot);
}

function spotOf(settings: SettingsRow): WeatherSpot | null {
  if (settings.latitude === null || settings.longitude === null) {
    return null;
  }
  return {
    latitude: settings.latitude,
    longitude: settings.longitude,
    timeZone: settings.time_zone,
  };
}

function spotKey(spot: WeatherSpot | null): string {
  return spot === null
    ? 'none'
    : `${String(spot.latitude)},${String(spot.longitude)},${spot.timeZone}`;
}

export class WeatherService {
  private readonly fetches: ScheduledFetch<WeatherRow>;
  private spot: string | null = null;
  private place: WeatherSpot | null = null;
  private unsubscribe: (() => void) | null = null;

  private resuming: Promise<void> = Promise.resolve();

  constructor(private readonly options: WeatherServiceOptions) {
    this.fetches = new ScheduledFetch({
      clock: options.clock,
      fetch: (): Promise<WeatherRow> => this.fetchOnce(),
      retrySeconds: RETRY_SECONDS,
      minGapMs: FRESH_MS,
    });
  }

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      const settings = change.table === 'settings' ? change.record : null;
      if (settings !== null) {
        queueMicrotask(() => {
          background(this.settingsChanged(settings), 'weather.location_change_failed');
        });
      }
    });
    this.resuming = this.resume();
    background(this.resuming, 'weather.resume_failed');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.fetches.cancel();
  }

  current(): Promise<WeatherRow> {
    return this.options.store.host.call('weather', 'read');
  }

  async refresh(): Promise<WeatherRow> {
    const row = await this.current();
    return this.fetches.refresh(row, {
      fetchedAt: row.fetched_at,
      healthy: row.error === null && row.air_error === null,
    });
  }

  async settled(): Promise<WeatherRow | null> {
    await this.resuming;
    return this.fetches.settled();
  }

  private async location(): Promise<WeatherSpot | null> {
    if (this.spot === null) this.adopt(await this.options.store.host.read('settingsRow', null));
    return this.place;
  }

  private adopt(settings: SettingsRow): void {
    if (this.spot === null) this.locate(settings);
  }

  private locate(settings: SettingsRow): string {
    this.place = spotOf(settings);
    this.spot = spotKey(this.place);
    return this.spot;
  }

  private async resume(): Promise<void> {
    const spot = await this.location();
    const row = await this.current();
    if (spot === null) {
      await this.clearIfNeeded(row);
      return;
    }
    const matches =
      row.forecast !== null &&
      row.forecast.timeZone === spot.timeZone &&
      Math.abs(row.forecast.latitude - spot.latitude) < 0.1 &&
      Math.abs(row.forecast.longitude - spot.longitude) < 0.1;
    const due = row.next_fetch_at === null ? 0 : Date.parse(row.next_fetch_at);
    if (matches && due > this.options.clock.now().getTime()) {
      this.fetches.schedule(new Date(due));
      return;
    }
    background(this.fetches.run(), 'fetches.run_failed');
  }

  private async settingsChanged(settings: SettingsRow): Promise<void> {
    const before = this.spot;
    const key = this.locate(settings);
    if (before === null || key === before) {
      return;
    }
    this.fetches.reset();
    this.fetches.cancel();
    await this.options.store.host.call('weather', 'cleared');
    this.options.log.info('weather.location_changed', { located: key !== 'none' });
    await this.resume();
  }

  private async clearIfNeeded(row: WeatherRow): Promise<void> {
    this.fetches.cancel();
    if (row.forecast !== null || row.error !== null || row.next_fetch_at !== null) {
      await this.options.store.host.call('weather', 'cleared');
    }
  }

  private async fetchOnce(): Promise<WeatherRow> {
    const spot = await this.location();
    if (spot === null) {
      this.options.log.debug('weather.fetch_skipped', { reason: 'no_location' });
      return this.current();
    }
    const key = spotKey(spot);
    const startedAt = this.options.clock.now().getTime();
    this.options.log.debug('weather.fetch_started', { timeZone: spot.timeZone });
    const [forecast, air] = await Promise.allSettled([
      fetchForecast(this.options.request, spot),
      fetchAir(this.options.request, spot),
    ]);
    this.options.log.debug('weather.fetch_settled', () => ({
      forecast: forecast.status,
      air: air.status,
      durationMs: this.options.clock.now().getTime() - startedAt,
    }));
    if (key !== this.spot) {
      this.options.log.info('weather.fetch_discarded', { reason: 'location_changed' });
      return this.current();
    }
    if (forecast.status === 'rejected') {
      return this.failed(messageOf(forecast.reason));
    }
    return this.fetched(
      { ...forecast.value, timeZone: spot.timeZone },
      air.status === 'fulfilled' ? air.value : null,
      air.status === 'rejected' ? messageOf(air.reason) : null,
    );
  }

  private async fetched(
    parts: Omit<NonNullable<WeatherRow['forecast']>, 'air'>,
    air: WeatherAir | null,
    airError: string | null,
  ): Promise<WeatherRow> {
    if (airError === null) {
      this.fetches.reset();
    }
    const next = airError === null ? nextSlot(this.options.clock.now()) : this.fetches.retryAt();
    const row = await this.options.store.host.call('weather', 'fetched', {
      forecast: { ...parts, air },
      airError,
      nextFetchAt: next.toISOString(),
    });
    if (airError !== null) {
      this.options.log.warn('weather.air_failed', { reason: airError });
    }
    this.options.log.info('weather.fetched', {
      weatherCode: parts.now.code,
      next: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }

  private async failed(reason: string): Promise<WeatherRow> {
    const next = this.fetches.retryAt();
    this.options.log.warn('weather.fetch_failed', { reason, retryAt: next.toISOString() });
    const row = await this.options.store.host.call('weather', 'failed', {
      error: reason,
      nextFetchAt: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }
}
