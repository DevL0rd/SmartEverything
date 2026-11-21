import {
  CLIENT_ROW,
  type ClientRow,
  type DeviceRow,
  type JsonValue,
  WATCH_STATE,
  type WatchState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalWatches } from '../../src/local/watches';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = Date.parse('2026-10-08T10:00:00.000Z');
const EXTERNAL_ID = 'xiaomi_watch:AA';
const SYNC_GAP_MS = 550;

let test: TestStore;
let watches: LocalWatches;
let device: DeviceRow;
let profileId: string;
let phone: ClientRow;
let observed: Readonly<Record<string, JsonValue>>[];

function moment(ms: number): string {
  return new Date(START + ms).toISOString();
}

function state(ms: number, battery = 80): WatchState {
  return WATCH_STATE.parse({
    phase: 'connected',
    battery,
    charging: false,
    worn: true,
    firmware: '1.0',
    steps: 100,
    heartRate: 70,
    lastSyncAt: moment(ms),
    error: null,
    at: moment(ms),
  });
}

async function syncLoop(seconds: number): Promise<void> {
  for (let ms = 0; ms < seconds * 1000; ms += SYNC_GAP_MS) {
    await watches.report(device, profileId, state(ms), phone);
  }
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
  phone = CLIENT_ROW.parse({
    id: crypto.randomUUID(),
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: profileId,
    created_at: moment(0),
    last_seen_at: null,
  });
  observed = [];
  watches = new LocalWatches({
    store: test.store,
    secrets: { deviceKey: (): string => '0123456789abcdef0123456789abcdef' },
    local: {
      observe: (_externalId, values): Promise<void> => {
        if ('reportedAt' in values) {
          observed.push(values);
        }
        device = { ...device, details: { ...device.details, ...values } };
        return Promise.resolve();
      },
      deviceOf: (): Promise<DeviceRow> => Promise.resolve(device),
    },
    wearables: (): Promise<{ wearables: []; skipped: [] }> =>
      Promise.resolve({ wearables: [], skipped: [] }),
    state: { push: (): void => undefined },
    now: new FakeClock(moment(0)).now,
    log: testLogger('watch'),
  });
  await watches.mine(profileId, phone);
});

afterEach(async () => {
  await test.close();
});

describe('watch state reports that only move the sync time', () => {
  it('writes the devices row once per 30 s of a twice-a-second sync loop', async () => {
    await syncLoop(30);
    expect(observed).toHaveLength(1);
  });

  it('still refreshes the sync time once a minute', async () => {
    await syncLoop(130);
    expect(observed.map((values) => values['reportedAt'])).toEqual([
      moment(0),
      moment(60_500),
      moment(121_000),
    ]);
  });

  it('writes a real change at once', async () => {
    await watches.report(device, profileId, state(0), phone);
    await watches.report(device, profileId, state(SYNC_GAP_MS, 79), phone);
    expect(observed.map((values) => values['battery'])).toEqual([80, 79]);
  });
});
