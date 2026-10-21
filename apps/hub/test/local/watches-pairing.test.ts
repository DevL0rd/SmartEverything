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

const NOW = '2026-10-08T10:00:00.000Z';
const EXTERNAL_ID = 'xiaomi_watch:AA';

let test: TestStore;
let watches: LocalWatches;
let device: DeviceRow;
let profileId: string;
let phone: ClientRow;
let tablet: ClientRow;
let observed: Readonly<Record<string, JsonValue>>[];

function clientOf(profile: string, name: string): ClientRow {
  return CLIENT_ROW.parse({
    id: crypto.randomUUID(),
    name,
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: profile,
    created_at: NOW,
    last_seen_at: null,
  });
}

function state(phase: WatchState['phase']): WatchState {
  return WATCH_STATE.parse({
    phase,
    battery: null,
    charging: null,
    worn: null,
    firmware: null,
    steps: null,
    heartRate: null,
    lastSyncAt: null,
    error: null,
    at: NOW,
  });
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
  phone = clientOf(profileId, 'Phone');
  tablet = clientOf(profileId, 'Tablet');
  observed = [];
  watches = new LocalWatches({
    store: test.store,
    secrets: { deviceKey: (): string => '0123456789abcdef0123456789abcdef' },
    local: {
      observe: (_externalId, values): Promise<void> => {
        observed.push(values);
        device = { ...device, details: { ...device.details, ...values } };
        return Promise.resolve();
      },
      deviceOf: (): DeviceRow => device,
    },
    wearables: (): Promise<{ wearables: []; skipped: [] }> =>
      Promise.resolve({ wearables: [], skipped: [] }),
    state: { push: (): void => undefined },
    now: new FakeClock(NOW).now,
    log: testLogger('watch'),
  });
});

afterEach(async () => {
  await test.close();
});

describe('which app may bridge a watch', () => {
  it('offers the watch to the first app that asks', async () => {
    expect((await watches.mine(profileId, phone)).watches).toHaveLength(1);
  });

  it('remembers an app once it has connected to the watch', async () => {
    await watches.mine(profileId, phone);
    await watches.report(device, profileId, state('connecting'), phone);
    expect(device.details['pairedBy']).toBeUndefined();
    await watches.report(device, profileId, state('connected'), phone);
    expect(device.details['pairedBy']).toEqual([{ clientId: phone.id, clientName: 'Phone' }]);
    await watches.report(device, profileId, state('connected'), phone);
    expect(device.details['pairedBy']).toEqual([{ clientId: phone.id, clientName: 'Phone' }]);
  });

  it('never offers the watch to an app that has not connected to it once another has', async () => {
    await watches.mine(profileId, phone);
    await watches.report(device, profileId, state('connected'), phone);
    await watches.report(device, profileId, state('failed'), phone);
    expect((await watches.mine(profileId, tablet)).watches).toHaveLength(0);
    expect(watches.bridgeClientOf(device)).toBe(phone.id);
  });

  it('still lets an app take the watch over on purpose and then keeps offering it', async () => {
    await watches.mine(profileId, phone);
    await watches.report(device, profileId, state('connected'), phone);
    await watches.takeOverBridge(device, profileId, tablet);
    expect((await watches.mine(profileId, tablet)).watches).toHaveLength(1);
  });
});
