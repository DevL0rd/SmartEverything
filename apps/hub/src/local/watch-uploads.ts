import {
  ApiError,
  WATCH_SOURCE_APP,
  type HealthRecord,
  type WatchRoute,
  type WatchSampleBatch,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface WatchUpload {
  readonly records: readonly HealthRecord[];
  readonly samples: readonly WatchSampleBatch[];
  readonly routes: readonly WatchRoute[];
}

export interface UploadOwner {
  readonly profileId: string;
  readonly deviceId: string;
}

export interface UploadResult {
  readonly saved: number;
  readonly samples: number;
  readonly unmatchedRoutes: string[];
}

function checkOwnership(owner: UploadOwner, records: readonly HealthRecord[]): void {
  const prefix = `watch:${owner.deviceId}:`;
  const foreign = records.find(
    (record) => record.sourceApp !== WATCH_SOURCE_APP || !record.recordId.startsWith(prefix),
  );
  if (foreign !== undefined) {
    throw new ApiError(
      'invalid_request',
      `Watch records must come from ${WATCH_SOURCE_APP} with ids starting ${prefix}; received ${foreign.sourceApp} ${foreign.recordId}.`,
    );
  }
}

function withRoute(session: HealthRecord, route: WatchRoute): HealthRecord | null {
  if (session.type !== 'ExerciseSession') {
    return null;
  }
  const locations = route.points.map((point) => ({
    time: point.time,
    latitude: point.latitude,
    longitude: point.longitude,
    altitudeMeters: point.altitudeMeters,
    horizontalAccuracyMeters: point.horizontalAccuracyMeters,
    verticalAccuracyMeters: null,
  }));
  return { ...session, data: { ...session.data, route: { status: 'recorded', locations } } };
}

const ROUTE_MATCH_MS = 120_000;

function sessionAt(store: Store, owner: UploadOwner, start: string): HealthRecord | undefined {
  const at = Date.parse(start);
  const distance = (record: HealthRecord): number => Math.abs(Date.parse(record.startTime) - at);
  return store.health
    .records(
      {
        types: ['ExerciseSession'],
        from: new Date(at - ROUTE_MATCH_MS).toISOString(),
        to: new Date(at + ROUTE_MATCH_MS).toISOString(),
      },
      owner.profileId,
    )
    .filter(
      (record) =>
        record.recordId.startsWith(`watch:${owner.deviceId}:`) &&
        distance(record) <= ROUTE_MATCH_MS,
    )
    .sort((left, right) => distance(left) - distance(right))[0];
}

function routedSessions(
  store: Store,
  owner: UploadOwner,
  routes: readonly WatchRoute[],
): { readonly sessions: HealthRecord[]; readonly unmatched: string[] } {
  const sessions: HealthRecord[] = [];
  const unmatched: string[] = [];
  for (const route of routes) {
    const session = sessionAt(store, owner, route.start);
    const routed = session === undefined ? null : withRoute(session, route);
    if (routed === null) {
      unmatched.push(route.start);
    } else {
      sessions.push(routed);
    }
  }
  return { sessions, unmatched };
}

export function saveWatchUpload(
  store: Store,
  owner: UploadOwner,
  upload: WatchUpload,
): UploadResult {
  checkOwnership(owner, upload.records);
  return store.write(() => {
    store.health.replaceOwn({
      profileId: owner.profileId,
      previous: owner.profileId,
      records: upload.records,
      removed: [],
    });
    const { sessions, unmatched } = routedSessions(store, owner, upload.routes);
    if (sessions.length > 0) {
      store.health.replaceOwn({
        profileId: owner.profileId,
        previous: owner.profileId,
        records: sessions,
        removed: [],
      });
    }
    const days = upload.samples.flatMap((batch) => store.watchDays.save(owner, batch));
    store.health.recomputeDays(owner.profileId, [...new Set(days)]);
    return {
      saved: upload.records.length + sessions.length,
      samples: upload.samples.reduce((total, batch) => total + batch.samples.length, 0),
      unmatchedRoutes: unmatched,
    };
  });
}
