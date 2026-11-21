import { areaInScope, type HealthMetric, type HistoryRow } from '@smarteverything/domain';
import { scopesOf } from '../../server/person-scope-units';
import { storeUnit } from '../../store/host/unit';
import type { EventListWindow } from '../../store/repositories/events';
import type { BucketQuery } from '../../store/repositories/state';

export interface WorldHealthAsk {
  readonly profileId: string;
  readonly from: string;
  readonly to: string;
  readonly metrics: readonly HealthMetric[];
  readonly scoped: boolean;
}

export interface WorldSeriesAsk {
  readonly capability: string;
  readonly deviceId: string;
  readonly from: string;
  readonly to: string;
}

export interface WorldLatestAsk {
  readonly capability: string;
  readonly deviceIds: readonly string[];
  readonly to?: string;
  readonly limit: number;
}

const EPOCH = '1970-01-01T00:00:00.000Z';

export const WORLD_SERIES_UNIT = storeUnit((store, ask: WorldSeriesAsk) => {
  const series = { capabilities: [ask.capability], deviceIds: [ask.deviceId] };
  const before = store.state.history({
    ...series,
    from: EPOCH,
    to: ask.from,
    order: 'desc',
    limit: 1,
  });
  return {
    points: store.state.history({
      ...series,
      from: ask.from,
      to: ask.to,
      order: 'asc',
      limit: Number.MAX_SAFE_INTEGER,
    }),
    ...(before[0] === undefined ? {} : { carried: before[0].value }),
  };
});

export const WORLD_LATEST_UNIT = storeUnit(
  (store, ask: WorldLatestAsk): Readonly<Record<string, HistoryRow[]>> =>
    Object.fromEntries(
      ask.deviceIds.map((deviceId) => [
        deviceId,
        store.state.history({
          capabilities: [ask.capability],
          deviceIds: [deviceId],
          from: EPOCH,
          ...(ask.to === undefined ? {} : { to: ask.to }),
          order: 'desc',
          limit: ask.limit,
        }),
      ]),
    ),
);

export const WORLD_STATE_BUCKETS_UNIT = storeUnit((store, query: BucketQuery) =>
  store.state.buckets(query),
);

export const WORLD_EVENTS_UNIT = storeUnit((store, window: EventListWindow) =>
  store.events.list(window),
);

export const WORLD_HEALTH_UNIT = storeUnit((store, ask: WorldHealthAsk) =>
  ask.scoped && !areaInScope(scopesOf(store, ask.profileId), 'health')
    ? { refused: true as const }
    : {
        refused: false as const,
        rows: store.health.dailyRange(ask.profileId, ask.from, ask.to, ask.metrics),
      },
);
