import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_METRICS } from '@smarteverything/domain';
import { dayKeyOf, shiftDay } from '../../../format/time';
import { seriesOf } from '../model/catalogue';
import { windowOf } from '../model/window';
import { ROUTES } from '../routes';
import { lastNightRange } from './nights';
import {
  preloadActivity,
  preloadBody,
  preloadBrowse,
  preloadHeart,
  preloadSleep,
  preloadToday,
  preloadVitals,
  preloadWorkouts,
} from './preload';
import { PRESENCE_DAYS, healthKeys, olderDailyQuery, sightingsSince } from './queries';
import { seriesReads } from './series';
import { LIST_TYPES } from './workout-list';

vi.mock('./reads', () => ({
  readSightings: vi.fn(() =>
    Promise.resolve([
      { recordType: 'Steps' },
      { recordType: 'SleepSession' },
      { recordType: 'HeartRate' },
    ]),
  ),
  readDailyFigures: vi.fn(() => Promise.resolve([])),
  readRecords: vi.fn(() => Promise.resolve([])),
  readBestDay: vi.fn(() => Promise.resolve(null)),
}));

const today = dayKeyOf(Date.now());

function cachedKeys(client: QueryClient): string[] {
  return client
    .getQueryCache()
    .getAll()
    .map((query) => JSON.stringify(query.queryKey));
}

function key(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

describe('fitness page preloads', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  });

  it('gives every fitness page a preload', () => {
    const pages = ROUTES.filter((route) => route.parent !== null);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.filter((route) => route.preload === undefined)).toEqual([]);
  });

  it('fills the presence and older-days queries the Today and Browse pages read', async () => {
    await preloadToday({ queryClient: client });
    const keys = cachedKeys(client);
    const older = olderDailyQuery(shiftDay(today, -PRESENCE_DAYS), today);
    expect(keys).toContain(key(healthKeys.sightings(sightingsSince(today))));
    expect(older).not.toBeNull();
    expect(keys).toContain(key(older?.queryKey ?? []));
    const night = lastNightRange(today);
    expect(keys).toContain(key(healthKeys.records(['SleepSession'], night.from, night.to)));
    const browse = new QueryClient();
    await preloadBrowse({ queryClient: browse });
    expect(cachedKeys(browse)).toContain(key(healthKeys.sightings(sightingsSince(today))));
  });

  it('fills the series queries of a domain page for the series that have data', async () => {
    await preloadActivity({ queryClient: client });
    const window = windowOf('week', today);
    const reads = seriesReads(seriesOf('steps'), window, false);
    expect(reads.metrics.length).toBeGreaterThan(0);
    expect(cachedKeys(client)).toContain(
      key(healthKeys.daily(reads.before.firstDay, window.lastDay, reads.metrics)),
    );
  });

  it('skips series with no data', async () => {
    await preloadBody({ queryClient: client });
    await preloadVitals({ queryClient: client });
    const month = windowOf('month', today);
    const weight = seriesReads(seriesOf('weight'), month, false);
    expect(cachedKeys(client)).not.toContain(
      key(healthKeys.daily(weight.before.firstDay, month.lastDay, weight.metrics)),
    );
  });

  it('fills the sleep, heart and workouts page extras', async () => {
    await preloadSleep({ queryClient: client });
    await preloadHeart({ queryClient: client });
    await preloadWorkouts({ queryClient: client });
    const keys = cachedKeys(client);
    const week = windowOf('week', today);
    const month = windowOf('month', today);
    expect(keys).toContain(key(healthKeys.records(['SleepSession'], week.start, week.end)));
    expect(keys).toContain(key(healthKeys.records(['HeartRate'], week.start, week.end)));
    expect(keys).toContain(key(healthKeys.best('heart_rate_maximum', false)));
    expect(keys).toContain(key(healthKeys.records(LIST_TYPES, month.start, month.end)));
    expect(HEALTH_METRICS.length).toBeGreaterThan(0);
  });
});
