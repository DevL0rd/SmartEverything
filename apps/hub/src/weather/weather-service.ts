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
  private spot: string;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: WeatherServiceOptions) {
    this.fetches = new ScheduledFetch({
      clock: options.clock,
      fetch: (): Promise<WeatherRow> => this.fetchOnce(),
      retrySeconds: RETRY_SECONDS,
      minGapMs: FRESH_MS,
    });
    this.spot = spotKey(spotOf(options.store.settings.read()));
  }

  start(): void {
    this.unsubscribe = this.options.store.feed.subscribe((change) => {
      const settings = change.table === 'settings' ? change.record : null;
      if (settings !== null) {
        queueMicrotask(() => {
          this.settingsChanged(settings);
        });
      }
    });
    this.resume();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.fetches.cancel();
  }

  current(): WeatherRow {
    return this.options.store.weather.read();
  }

  refresh(): Promise<WeatherRow> {
    const row = this.current();
    return this.fetches.refresh(row, {
      fetchedAt: row.fetched_at,
      healthy: row.error === null && row.air_error === null,
    });
  }

  settled(): Promise<WeatherRow> | null {
    return this.fetches.settled();
  }

  private resume(): void {
    const spot = spotOf(this.options.store.settings.read());
    const row = this.current();
    if (spot === null) {
      this.clearIfNeeded(row);
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

  private settingsChanged(settings: SettingsRow): void {
    const key = spotKey(spotOf(settings));
    if (key === this.spot) {
      return;
    }
    this.spot = key;
    this.fetches.reset();
    this.fetches.cancel();
    this.options.store.weather.cleared();
    this.options.log.info('weather.location_changed', { located: key !== 'none' });
    this.resume();
  }

  private clearIfNeeded(row: WeatherRow): void {
    this.fetches.cancel();
    if (row.forecast !== null || row.error !== null || row.next_fetch_at !== null) {
      this.options.store.weather.cleared();
    }
  }

  private async fetchOnce(): Promise<WeatherRow> {
    const spot = spotOf(this.options.store.settings.read());
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

  private fetched(
    parts: Omit<NonNullable<WeatherRow['forecast']>, 'air'>,
    air: WeatherAir | null,
    airError: string | null,
  ): WeatherRow {
    if (airError === null) {
      this.fetches.reset();
    }
    const next = airError === null ? nextSlot(this.options.clock.now()) : this.fetches.retryAt();
    const row = this.options.store.weather.fetched({
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

  private failed(reason: string): WeatherRow {
    const next = this.fetches.retryAt();
    this.options.log.warn('weather.fetch_failed', { reason, retryAt: next.toISOString() });
    const row = this.options.store.weather.failed({
      error: reason,
      nextFetchAt: next.toISOString(),
    });
    this.fetches.schedule(next);
    return row;
  }
}
