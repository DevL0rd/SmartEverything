import type { QueryClient } from '@tanstack/react-query';
import type { HealthRecordType } from '@smarteverything/domain';
import { dayKeyOf, shiftDay } from '../../../format/time';
import { seriesOf } from '../model/catalogue';
import { DOMAIN_INFO, seriesWithData, type FitnessDomain } from '../model/domains';
import { windowOf, type Range, type Window } from '../model/window';
import type { PreloadContext } from '../../../app-shell/route-types';
import { lastNightRange } from './nights';
import {
  PRESENCE_DAYS,
  bestDayQuery,
  dailyQuery,
  olderDailyQuery,
  recordsQuery,
  sightingsQuery,
} from './queries';
import { seriesReads } from './series';
import { LIST_TYPES } from './workout-list';
import type { SeriesSpec } from '../model/series-spec';

type Preload = (context: PreloadContext) => Promise<void>;

async function readPresence(
  client: QueryClient,
  today: string,
): Promise<ReadonlySet<HealthRecordType>> {
  const sightings = await client.query(sightingsQuery(today));
  return new Set(sightings.map((sighting) => sighting.recordType));
}

async function readOlderDaily(client: QueryClient, today: string): Promise<void> {
  const query = olderDailyQuery(shiftDay(today, -PRESENCE_DAYS), today);
  if (query !== null) {
    await client.query(query);
  }
}

async function readSeries(client: QueryClient, spec: SeriesSpec, window: Window): Promise<void> {
  const { before, metrics, types } = seriesReads(spec, window, false);
  await Promise.all([
    metrics.length > 0
      ? client.query(dailyQuery(before.firstDay, window.lastDay, metrics))
      : undefined,
    types.length > 0 ? client.query(recordsQuery(types, before.start, window.end)) : undefined,
  ]);
}

async function readDomain(
  client: QueryClient,
  domain: FitnessDomain,
  window: Window,
  today: string,
): Promise<void> {
  const present = await readPresence(client, today);
  const keys = seriesWithData(present, DOMAIN_INFO[domain].series);
  await Promise.all([
    readOlderDaily(client, today),
    ...keys.map((key) => readSeries(client, seriesOf(key), window)),
  ]);
}

function domainPreload(
  domain: FitnessDomain,
  range: Range,
  extra?: (client: QueryClient, today: string) => Promise<void>,
): Preload {
  return async ({ queryClient }) => {
    const today = dayKeyOf(Date.now());
    await Promise.all([
      readDomain(queryClient, domain, windowOf(range, today), today),
      extra?.(queryClient, today),
    ]);
  };
}

async function readLastNight(client: QueryClient, today: string): Promise<void> {
  const { from, to } = lastNightRange(today);
  await client.query(recordsQuery(['SleepSession'], from, to));
}

export const preloadBrowse: Preload = async ({ queryClient }) => {
  const today = dayKeyOf(Date.now());
  await Promise.all([readPresence(queryClient, today), readOlderDaily(queryClient, today)]);
};

export const preloadToday: Preload = async (context) => {
  await Promise.all([
    preloadBrowse(context),
    readLastNight(context.queryClient, dayKeyOf(Date.now())),
  ]);
};

export const preloadActivity = domainPreload('activity', 'week');
export const preloadBody = domainPreload('body', 'month');
export const preloadVitals = domainPreload('vitals', 'month');

export const preloadHeart = domainPreload('heart', 'week', async (client, today) => {
  const window = windowOf('week', today);
  await Promise.all([
    client.query(recordsQuery(['HeartRate'], window.start, window.end)),
    client.query(bestDayQuery('heart_rate_maximum', false)),
  ]);
});

export const preloadSleep = domainPreload('sleep', 'week', async (client, today) => {
  const window = windowOf('week', today);
  await Promise.all([
    readLastNight(client, today),
    client.query(recordsQuery(['SleepSession'], window.start, window.end)),
  ]);
});

export const preloadWorkouts: Preload = async ({ queryClient }) => {
  const window = windowOf('month', dayKeyOf(Date.now()));
  await queryClient.query(recordsQuery(LIST_TYPES, window.start, window.end));
};
