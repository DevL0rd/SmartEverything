import {
  createClientToken,
  hashClientToken,
  type ClientRow,
  type DeviceEvent,
  type DeviceRow,
  type PhoneDetail,
  type PhoneDetailUpdate,
  stampPhoneDetail,
} from '@smarteverything/domain';
import type { DeviceRecord } from '../../src/database/port';
import { describePhone } from '../../src/phones/phone-device';
import type { PhoneViewer } from '../../src/phones/phone-detail';
import { PhoneNodes } from '../../src/phones/phone-nodes';
import { testLogger } from './logs';
import type { TestStore } from './store';

export const REPORT_AT = '2026-10-18T10:00:00.000Z';

export const OWNER: PhoneViewer = { role: 'owner', profileId: null };

export const FULL_DETAIL: PhoneDetailUpdate = {
  power: {
    level: 62,
    voltageMv: 4100,
    currentMa: 1800,
    temperatureC: 31.5,
    health: 'good',
    cycles: 212,
    charger: 'wireless',
    fullAt: '2026-10-18T18:40:00.000Z',
    memory: { totalBytes: 12e9, availableBytes: 5e9 },
  },
  sound: {
    streams: { media: 40, ring: 70, alarm: 80, notification: 50, call: 60 },
    output: { kind: 'bluetooth', name: 'Galaxy Buds3' },
    media: {
      title: 'Song',
      artist: 'Artist',
      app: 'com.spotify.music',
      appLabel: 'Spotify',
      state: 'playing',
      positionMs: 1000,
      durationMs: 200000,
    },
  },
  screen: {
    brightness: 64,
    auto: true,
    timeoutSeconds: 60,
    fold: 'open',
    writable: true,
    usage: {
      unlocksToday: 41,
      screenMinutesByDay: Array.from({ length: 7 }, (_, index) => ({
        day: `2026-10-${String(12 + index)}`,
        minutes: 100 + index,
      })),
    },
  },
  network: {
    kind: 'wifi',
    wifi: { ssid: 'Home', rssiDbm: -52, bars: 4, linkMbps: 866, bandGhz: 5 },
    cellular: { bars: 3, generation: '5g', operator: 'Telstra' },
    vpn: false,
    metered: false,
    airplane: false,
    data: {
      today: { wifiBytes: 1e9, mobileBytes: 2e8 },
      month: { wifiBytes: 3e10, mobileBytes: 4e9 },
    },
  },
  connections: { bluetooth: [{ name: 'Galaxy Buds3', kind: 'headset', batteryPercent: 80 }] },
  storage: {
    totalBytes: 256e9,
    freeBytes: 41e9,
    parts: [{ kind: 'apps', bytes: 60e9 }],
    apps: [{ package: 'com.example.big', label: 'Big', bytes: 5e9 }],
  },
  apps: {
    installedCount: 2,
    installed: [
      { package: 'com.a', label: 'A', iconHash: 'a'.repeat(64) },
      { package: 'com.b', label: 'B', iconHash: null },
    ],
    usage: [
      {
        package: 'com.a',
        minutesToday: 30,
        minutesByDay: [1, 2, 3, 4, 5, 6, 30],
        lastUsedAt: REPORT_AT,
      },
    ],
    front: 'com.a',
  },
  notifications: {
    count: 4,
    apps: [{ package: 'com.a', label: 'A', count: 4 }],
    items: [{ key: 'k1', package: 'com.a', title: 'Hello', at: REPORT_AT }],
  },
  alarm: { nextAt: '2026-10-19T06:30:00.000Z', appLabel: 'Clock' },
};

export const STORED_DETAIL: PhoneDetail = stampPhoneDetail(FULL_DETAIL, REPORT_AT);

export interface TestPhone {
  readonly device: DeviceRow;
  readonly clientId: string;
  readonly profileId: string;
}

export function addPhoneDevice(
  test: TestStore,
  phone: { readonly clientId: string; readonly profileId: string; readonly name: string },
): TestPhone {
  const described = describePhone(
    { clientId: phone.clientId, name: phone.name, profileId: phone.profileId },
    {
      actions: [
        { action: 'launch_app', state: 'ready' },
        { action: 'stop_ring', state: 'ready' },
        { action: 'open', state: 'ready' },
      ],
      permissions: [],
      features: [],
    },
  );
  const [device] = test.store.devices.upsert([
    {
      provider: 'local',
      externalId: described.externalId,
      parentId: null,
      kind: 'phone',
      name: phone.name,
      model: 'm',
      manufacturer: 'Google',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: described.capabilities,
      details: { clientId: phone.clientId, profileId: phone.profileId },
    },
  ]);
  if (device === undefined) throw new Error('The test phone was not saved.');
  return { device, clientId: phone.clientId, profileId: phone.profileId };
}

export interface TestPerson {
  readonly client: ClientRow;
  readonly profileId: string;
}

export function addPerson(test: TestStore, name: string, role: 'owner' | 'member'): TestPerson {
  const profile = test.store.profiles.create({ name });
  const client = test.store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(createClientToken()),
    profileId: profile.id,
  });
  return { client, profileId: profile.id };
}

export function idlePhoneNodes(
  test: TestStore,
  event: (event: DeviceEvent) => void = (): void => undefined,
): PhoneNodes {
  return new PhoneNodes({
    store: test.store,
    apply: (): Promise<readonly DeviceRecord[]> => Promise.resolve([]),
    forget: (): Promise<void> => Promise.resolve(),
    state: (): void => undefined,
    event,
    log: testLogger('phone'),
  });
}
