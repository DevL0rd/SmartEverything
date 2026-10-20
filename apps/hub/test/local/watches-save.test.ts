import {
  CLIENT_ROW,
  HEALTH_RECORD,
  WATCH_SOURCE_APP,
  type ClientRow,
  type DeviceRow,
  type HealthRecord,
  type StateUpdate,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalWatches } from '../../src/local/watches';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-08T10:00:00.000Z';
const EXTERNAL_ID = 'xiaomi_watch:AA';

let test: TestStore;
let watches: LocalWatches;
let device: DeviceRow;
let profileId: string;
let client: ClientRow;
let pushed: StateUpdate[];

function deviceKey(): null {
  return null;
}

function observe(): Promise<void> {
  return Promise.resolve();
}

function deviceOf(): DeviceRow {
  return device;
}

function wearables(): Promise<{ wearables: []; skipped: [] }> {
  return Promise.resolve({ wearables: [], skipped: [] });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  profileId = test.store.profiles.first().id;
  test.store.localDevices.add({
    externalId: EXTERNAL_ID,
    driver: 'xiaomi_watch',
    address: 'AA:BB:CC:DD:EE:FF',
    name: 'Watch',
    config: { profileId },
  });
  const [stored] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId: EXTERNAL_ID,
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
  if (stored === undefined) {
    throw new Error('the watch was not stored');
  }
  device = stored;
  client = CLIENT_ROW.parse({
    id: crypto.randomUUID(),
    name: 'Pixel',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: profileId,
    created_at: NOW,
    last_seen_at: null,
  });
  pushed = [];
  watches = new LocalWatches({
    store: test.store,
    secrets: { deviceKey },
    local: { observe, deviceOf },
    wearables,
    state: {
      push: (_provider, update): void => {
        pushed.push(update);
      },
    },
    now: new FakeClock(NOW).now,
    log: testLogger('watch'),
  });
});

afterEach(async () => {
  await test.close();
});

function record(partial: Record<string, unknown>): HealthRecord {
  return HEALTH_RECORD.parse({
    zoneOffsetSeconds: 0,
    sourceApp: WATCH_SOURCE_APP,
    lastModified: NOW,
    ...partial,
  });
}

function stored(type: HealthRecord['type']): HealthRecord[] {
  return test.store.health.records(
    { types: [type], from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' },
    profileId,
  );
}

describe('saving a watch upload', () => {
  it('keeps an hour of running at 210 steps a minute', async () => {
    const hour = record({
      recordId: `watch:${device.id}:steps:1`,
      type: 'Steps',
      startTime: '2026-10-08T07:00:00.000Z',
      endTime: '2026-10-08T08:00:00.000Z',
      data: { count: 12_600 },
    });
    const result = await watches.save(
      device,
      profileId,
      { records: [hour], samples: [], routes: [] },
      client,
    );
    expect(result).toEqual({ saved: 1, samples: 0, unmatchedRoutes: [] });
    expect(stored('Steps')).toHaveLength(1);
  });

  it('keeps a 25 hour sleep session and a heart rate extreme with the rest of the upload', async () => {
    const sleep = record({
      recordId: `watch:${device.id}:sleep:1`,
      type: 'SleepSession',
      startTime: '2026-10-06T06:00:00.000Z',
      endTime: '2026-10-07T07:00:00.000Z',
      data: { title: null, notes: null, stages: [] },
    });
    const heart = record({
      recordId: `watch:${device.id}:heart:1`,
      type: 'HeartRate',
      startTime: '2026-10-08T07:00:00.000Z',
      endTime: '2026-10-08T08:00:00.000Z',
      data: { samples: [{ time: '2026-10-08T07:30:00.000Z', bpm: 24 }] },
    });
    const result = await watches.save(
      device,
      profileId,
      { records: [sleep, heart], samples: [], routes: [] },
      client,
    );
    expect(result.saved).toBe(2);
    expect(stored('SleepSession')).toHaveLength(1);
    expect(stored('HeartRate')).toHaveLength(1);
  });

  it('keeps a record that ends after the hub clock', async () => {
    const ahead = record({
      recordId: `watch:${device.id}:steps:2`,
      type: 'Steps',
      startTime: '2026-10-08T10:00:00.000Z',
      endTime: '2026-10-08T10:30:00.000Z',
      data: { count: 20 },
    });
    await watches.save(device, profileId, { records: [ahead], samples: [], routes: [] }, client);
    expect(stored('Steps')).toHaveLength(1);
  });
});

describe('reporting a watch workout', () => {
  const state = {
    phase: 'connected',
    battery: 80,
    charging: false,
    worn: true,
    firmware: null,
    steps: null,
    heartRate: null,
    lastSyncAt: null,
    error: null,
    at: NOW,
  } as const;

  it('publishes the workout state as the watch_workout value', async () => {
    await watches.report(
      device,
      profileId,
      {
        ...state,
        workout: {
          sport: 'treadmill',
          state: 'paused',
          startedAt: NOW,
          endedAt: null,
          pausedAt: NOW,
          pausedSeconds: 0,
          startedFrom: 'phone',
          heartRate: null,
          kcal: null,
          steps: null,
          distanceM: null,
          updatedAt: NOW,
        },
      },
      client,
    );
    expect(pushed).toEqual([
      { externalId: EXTERNAL_ID, capability: 'watch_workout', value: 'paused', observedAt: NOW },
    ]);
  });

  it('publishes nothing when the report carries no workout', async () => {
    await watches.report(device, profileId, state, client);
    expect(pushed).toEqual([]);
  });
});
