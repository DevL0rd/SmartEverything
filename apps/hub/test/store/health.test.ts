import { HEALTH_RECORD, type HealthRecord, type RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dailyFigures } from '../../src/store/health-daily';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const ENVELOPE = {
  zoneOffsetSeconds: 7200,
  sourceApp: 'com.mi.health',
  lastModified: '2026-10-08T12:00:00Z',
};

function record(recordId: string, fields: Readonly<Record<string, unknown>>): HealthRecord {
  return HEALTH_RECORD.parse({ ...ENVELOPE, recordId, ...fields });
}

const STEPS_MORNING = record('s1', {
  type: 'Steps',
  startTime: '2026-10-08T06:00:00Z',
  endTime: '2026-10-08T07:00:00Z',
  data: { count: 1000 },
});
const STEPS_EVENING = record('s2', {
  type: 'Steps',
  startTime: '2026-10-08T18:00:00Z',
  endTime: '2026-10-08T19:00:00Z',
  data: { count: 500 },
});
const HEART = record('h1', {
  type: 'HeartRate',
  startTime: '2026-10-08T08:00:00Z',
  endTime: '2026-10-08T08:10:00Z',
  data: {
    samples: [
      { time: '2026-10-08T08:00:00Z', bpm: 60 },
      { time: '2026-10-08T08:05:00Z', bpm: 90 },
    ],
  },
});
const WEIGHT_OLD = record('w1', {
  type: 'Weight',
  startTime: '2026-10-08T06:00:00Z',
  endTime: null,
  data: { kilograms: 80 },
});
const WEIGHT_NEW = record('w2', {
  type: 'Weight',
  startTime: '2026-10-08T07:00:00Z',
  endTime: null,
  data: { kilograms: 79.5 },
});
const SLEEP = record('z1', {
  type: 'SleepSession',
  startTime: '2026-10-07T21:00:00Z',
  endTime: '2026-10-08T05:00:00Z',
  data: { title: null, notes: null, stages: [] },
});

describe('dailyFigures', () => {
  it('sums, averages and takes the latest figure as the database did', () => {
    expect(
      dailyFigures([WEIGHT_NEW, STEPS_MORNING, HEART, SLEEP, WEIGHT_OLD, STEPS_EVENING]),
    ).toStrictEqual([
      { metric: 'steps', value: 1500, unit: 'count' },
      { metric: 'sleep', value: 480, unit: 'min' },
      { metric: 'heart_rate_average', value: 75, unit: 'bpm' },
      { metric: 'heart_rate_minimum', value: 60, unit: 'bpm' },
      { metric: 'heart_rate_maximum', value: 90, unit: 'bpm' },
      { metric: 'weight', value: 79.5, unit: 'kg' },
    ]);
  });

  it('has no figure for a day without records', () => {
    expect(dailyFigures([])).toStrictEqual([]);
  });

  it('counts the minutes asleep, not the time in bed, and never more than the session', () => {
    const night = record('z2', {
      type: 'SleepSession',
      startTime: '2026-10-07T21:00:00Z',
      endTime: '2026-10-08T05:00:00Z',
      data: {
        title: null,
        notes: null,
        stages: [
          { startTime: '2026-10-07T21:00:00Z', endTime: '2026-10-07T22:00:00Z', stage: 1 },
          { startTime: '2026-10-07T22:00:00Z', endTime: '2026-10-08T02:00:00Z', stage: 4 },
          { startTime: '2026-10-08T02:00:00Z', endTime: '2026-10-08T02:30:00Z', stage: 7 },
          { startTime: '2026-10-08T02:30:00Z', endTime: '2026-10-08T05:00:00Z', stage: 5 },
        ],
      },
    });
    const nap = record('z3', {
      type: 'SleepSession',
      startTime: '2026-10-08T13:00:00Z',
      endTime: '2026-10-08T13:30:00Z',
      data: { title: null, notes: null, stages: [] },
    });
    expect(dailyFigures([night])).toStrictEqual([{ metric: 'sleep', value: 390, unit: 'min' }]);
    expect(dailyFigures([night, nap])).toStrictEqual([
      { metric: 'sleep', value: 420, unit: 'min' },
    ]);
  });

  it('reads the heart-rate extremes of a very large day without exceeding the argument limit', () => {
    const samples = Array.from({ length: 300_000 }, (_, index) => ({
      time: '2026-10-08T08:00:00Z',
      bpm: 50 + (index % 120),
    }));
    const busy = record('h2', {
      type: 'HeartRate',
      startTime: '2026-10-08T08:00:00Z',
      endTime: '2026-10-08T09:00:00Z',
      data: { samples },
    });
    expect(dailyFigures([busy]).filter((figure) => figure.metric.endsWith('imum'))).toStrictEqual([
      { metric: 'heart_rate_minimum', value: 50, unit: 'bpm' },
      { metric: 'heart_rate_maximum', value: 169, unit: 'bpm' },
    ]);
  });
});

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('health ingest', () => {
  const batch = {
    records: [STEPS_MORNING, STEPS_EVENING, SLEEP],
    deletions: [],
    grantedTypes: ['Steps', 'SleepSession'],
    source: { device: 'Pixel', appVersion: '1.0' },
  } as const;

  it('stores newer records, skips stale ones and recomputes the local days they touch', () => {
    const { store } = opened;
    const profile = store.profiles.first().id;
    expect(
      store.health.ingest(
        {
          ...batch,
          records: [...batch.records],
          deletions: [],
          grantedTypes: [...batch.grantedTypes],
        },
        profile,
      ),
    ).toStrictEqual({
      stored: 3,
      stale: 0,
      deleted: 0,
      days: ['2026-10-08'],
    });
    expect(
      store.health.ingest(
        { ...batch, records: [STEPS_MORNING], deletions: [], grantedTypes: [] },
        profile,
      ),
    ).toMatchObject({ stored: 0, stale: 1 });
    const moved = HEALTH_RECORD.parse({
      ...STEPS_MORNING,
      lastModified: '2026-10-09T12:00:00Z',
      startTime: '2026-10-09T06:00:00Z',
      endTime: '2026-10-09T07:00:00Z',
    });
    expect(
      store.health.ingest({ ...batch, records: [moved], deletions: [], grantedTypes: [] }, profile)
        .days,
    ).toStrictEqual(['2026-10-08', '2026-10-09']);
    expect(
      store.health
        .dailyRange(profile, '2026-10-08', '2026-10-09', ['steps', 'sleep'])
        .map((row) => [row.day, row.metric, row.value]),
    ).toStrictEqual([
      ['2026-10-08', 'sleep', 480],
      ['2026-10-08', 'steps', 500],
      ['2026-10-09', 'steps', 1000],
    ]);
    expect(store.health.bestDay(profile, 'steps', false)).toStrictEqual({
      day: '2026-10-09',
      value: 1000,
    });
    expect(store.health.bestDay(profile, 'steps', true)).toStrictEqual({
      day: '2026-10-08',
      value: 500,
    });
    expect(store.health.bestDay(profile, 'weight', true)).toBeNull();
  });

  it('removes a day figure when its last record is deleted and says so on the feed', () => {
    const { store } = opened;
    const profile = store.profiles.first().id;
    store.health.ingest(
      { ...batch, records: [STEPS_MORNING], deletions: [], grantedTypes: [] },
      profile,
    );
    const seen: RowChange[] = [];
    store.feed.subscribe((change) => seen.push(change));
    expect(
      store.health.ingest(
        {
          ...batch,
          records: [],
          deletions: ['s1', 'missing'],
          grantedTypes: [],
        },
        profile,
      ),
    ).toStrictEqual({
      stored: 0,
      stale: 0,
      deleted: 1,
      days: ['2026-10-08'],
    });
    expect(seen.map((change) => `${change.table}:${change.operation}`)).toStrictEqual([
      'health_daily:DELETE',
    ]);
    expect(store.health.record('s1', profile)).toBeUndefined();
    expect(() => store.health.requireRecord('s1', profile)).toThrow(
      'There is no health record s1.',
    );
  });

  it('reads records overlapping a window and which apps wrote them', () => {
    const { store } = opened;
    const profile = store.profiles.first().id;
    store.health.ingest(
      { ...batch, records: [...batch.records], deletions: [], grantedTypes: [] },
      profile,
    );
    expect(
      store.health
        .records(
          {
            types: ['SleepSession', 'Steps'],
            from: '2026-10-08T04:00:00Z',
            to: '2026-10-08T12:00:00Z',
          },
          profile,
        )
        .map((row) => row.recordId),
    ).toStrictEqual(['z1', 's1']);
    expect(store.health.requireRecord('s2', profile)).toStrictEqual({
      ...STEPS_EVENING,
      startTime: '2026-10-08T18:00:00.000Z',
      endTime: '2026-10-08T19:00:00.000Z',
      lastModified: '2026-10-08T12:00:00.000Z',
    });
    expect(store.health.sightings('2026-10-08T00:00:00Z', profile)).toStrictEqual([
      { sourceApp: 'com.mi.health', recordType: 'Steps' },
    ]);
  });

  it('tracks each phone’s health sync, its failures and its removal', () => {
    const { store } = opened;
    const phone = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'member',
      tokenHash: 'p',
    });
    expect(store.healthSources.find(phone.id)).toBeUndefined();
    expect(store.healthSources.register(phone.id, 'Pixel')).toMatchObject({
      client_id: phone.id,
      name: 'Pixel',
      last_sync_at: null,
    });
    expect(store.healthSources.register(phone.id, 'Pixel 9').name).toBe('Pixel 9');
    expect(store.healthSources.synced(phone.id, ['Steps'])).toMatchObject({
      granted_types: ['Steps'],
      last_error: null,
    });
    expect(store.healthSources.failed(phone.id, 'bad batch').last_error).toBe('bad batch');
    expect(store.healthSources.list()).toHaveLength(1);
    store.healthSources.remove(phone.id);
    expect(store.healthSources.find(phone.id)).toBeUndefined();
    expect(() => store.healthSources.synced(phone.id, [])).toThrow();
  });

  it('forgets a phone’s sync status when it is unpaired', () => {
    const { store } = opened;
    const phone = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'member',
      tokenHash: 'q',
    });
    store.healthSources.register(phone.id, 'Pixel');
    store.clients.remove(phone.id);
    expect(store.healthSources.list()).toStrictEqual([]);
  });
});
