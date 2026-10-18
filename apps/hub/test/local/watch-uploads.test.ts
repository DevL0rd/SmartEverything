import {
  ApiError,
  HEALTH_METRIC_UNITS,
  HEALTH_RECORD,
  WATCH_SOURCE_APP,
  type HealthRecord,
  type WatchRoute,
  type WatchSampleBatch,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveWatchUpload, type UploadOwner } from '../../src/local/watch-uploads';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let owner: UploadOwner;

function addWatch(externalId: string): string {
  const [device] = test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId,
      parentId: null,
      kind: 'sensor',
      name: 'Watch',
      model: 'xiaomi.watch',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) {
    throw new Error('the watch was not stored');
  }
  return device.id;
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  owner = { profileId: test.store.profiles.first().id, deviceId: addWatch('xiaomi_watch:AA') };
});

afterEach(async () => {
  await test.close();
});

function steps(recordId: string, startTime: string, sourceApp = WATCH_SOURCE_APP): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId,
    type: 'Steps',
    startTime,
    endTime: new Date(Date.parse(startTime) + 60_000).toISOString(),
    zoneOffsetSeconds: 0,
    sourceApp,
    lastModified: startTime,
    data: { count: 40 },
  });
}

function session(recordId: string, startTime: string): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId,
    type: 'ExerciseSession',
    startTime,
    endTime: new Date(Date.parse(startTime) + 1_800_000).toISOString(),
    zoneOffsetSeconds: 0,
    sourceApp: WATCH_SOURCE_APP,
    lastModified: startTime,
    data: {
      exerciseType: 56,
      title: null,
      notes: null,
      plannedExerciseSessionId: null,
      segments: [],
      laps: [],
      route: { status: 'absent' },
    },
  });
}

function route(start: string): WatchRoute {
  return {
    start,
    points: [
      {
        time: start,
        latitude: 13.7,
        longitude: 100.5,
        altitudeMeters: 4,
        horizontalAccuracyMeters: 6,
      },
    ],
  };
}

function stored(types: readonly HealthRecord['type'][]): HealthRecord[] {
  return test.store.health.records(
    { types: [...types], from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' },
    owner.profileId,
  );
}

const upload = (
  records: readonly HealthRecord[] = [],
  samples: readonly WatchSampleBatch[] = [],
  routes: readonly WatchRoute[] = [],
): {
  records: readonly HealthRecord[];
  samples: readonly WatchSampleBatch[];
  routes: readonly WatchRoute[];
} => ({
  records,
  samples,
  routes,
});

describe('saveWatchUpload', () => {
  it('saves records that carry this watch as their source and counts them', () => {
    const records = [
      steps(`watch:${owner.deviceId}:steps:1`, '2026-10-08T07:00:00.000Z'),
      steps(`watch:${owner.deviceId}:steps:2`, '2026-10-08T07:01:00.000Z'),
    ];
    expect(saveWatchUpload(test.store, owner, upload(records))).toEqual({
      saved: 2,
      samples: 0,
      unmatchedRoutes: [],
    });
    expect(
      stored(['Steps'])
        .map((record) => record.recordId)
        .sort(),
    ).toEqual(records.map((record) => record.recordId).sort());
  });

  it('refuses the whole upload when one record is another app or another watch', () => {
    const own = steps(`watch:${owner.deviceId}:steps:1`, '2026-10-08T07:00:00.000Z');
    const otherApp = steps(`watch:${owner.deviceId}:steps:2`, '2026-10-08T07:01:00.000Z', 'x.y');
    const otherWatch = steps('watch:another:steps:3', '2026-10-08T07:02:00.000Z');
    for (const foreign of [otherApp, otherWatch]) {
      expect(() => saveWatchUpload(test.store, owner, upload([own, foreign]))).toThrow(ApiError);
    }
    expect(stored(['Steps'])).toEqual([]);
  });

  it('keeps the same record once when the watch uploads it again', () => {
    const record = steps(`watch:${owner.deviceId}:steps:1`, '2026-10-08T07:00:00.000Z');
    saveWatchUpload(test.store, owner, upload([record]));
    saveWatchUpload(test.store, owner, upload([record]));
    expect(stored(['Steps'])).toHaveLength(1);
  });

  it('attaches a route to the exercise session that started closest to it', () => {
    const near = session(`watch:${owner.deviceId}:run:near`, '2026-10-08T07:00:30.000Z');
    const far = session(`watch:${owner.deviceId}:run:far`, '2026-10-08T07:01:50.000Z');
    const result = saveWatchUpload(
      test.store,
      owner,
      upload([near, far], [], [route('2026-10-08T07:00:00.000Z')]),
    );
    expect(result).toMatchObject({ saved: 3, unmatchedRoutes: [] });
    const routes = new Map(
      stored(['ExerciseSession']).map((record) => [
        record.recordId,
        record.type === 'ExerciseSession' ? record.data.route.status : null,
      ]),
    );
    expect(routes.get(`watch:${owner.deviceId}:run:near`)).toBe('recorded');
    expect(routes.get(`watch:${owner.deviceId}:run:far`)).toBe('absent');
  });

  it('reports a route with no session within two minutes as unmatched and saves nothing for it', () => {
    const run = session(`watch:${owner.deviceId}:run:1`, '2026-10-08T07:00:00.000Z');
    const result = saveWatchUpload(
      test.store,
      owner,
      upload([run], [], [route('2026-10-08T07:02:01.000Z')]),
    );
    expect(result).toEqual({ saved: 1, samples: 0, unmatchedRoutes: ['2026-10-08T07:02:01.000Z'] });
  });

  it('does not match a route to a session of another watch', () => {
    const other = addWatch('xiaomi_watch:BB');
    const run = session(`watch:${other}:run:1`, '2026-10-08T07:00:00.000Z');
    saveWatchUpload(test.store, { ...owner, deviceId: other }, upload([run]));
    const result = saveWatchUpload(
      test.store,
      owner,
      upload([], [], [route('2026-10-08T07:00:00.000Z')]),
    );
    expect(result.unmatchedRoutes).toEqual(['2026-10-08T07:00:00.000Z']);
  });

  it('counts the samples of every batch and files them under the watch day', () => {
    const batches: WatchSampleBatch[] = [
      {
        kind: 'stress',
        zoneOffsetSeconds: 0,
        samples: [
          { time: '2026-10-08T07:00:00.000Z', value: 30 },
          { time: '2026-10-08T07:05:00.000Z', value: 50 },
        ],
      },
      {
        kind: 'vitality',
        zoneOffsetSeconds: 0,
        samples: [{ time: '2026-10-08T08:00:00.000Z', value: 80 }],
      },
    ];
    expect(saveWatchUpload(test.store, owner, upload([], batches))).toEqual({
      saved: 0,
      samples: 3,
      unmatchedRoutes: [],
    });
    expect(test.store.watchDays.figures(owner.profileId, '2026-10-08')).toEqual([
      { metric: 'stress_average', value: 40, unit: HEALTH_METRIC_UNITS.stress_average },
      { metric: 'stress_maximum', value: 50, unit: HEALTH_METRIC_UNITS.stress_maximum },
      { metric: 'vitality', value: 80, unit: HEALTH_METRIC_UNITS.vitality },
    ]);
  });
});
