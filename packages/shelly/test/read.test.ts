import { describe, expect, it } from 'vitest';
import {
  SHELLY_DEVICE,
  SHELLY_DEVICE_INFO,
  SHELLY_KVS_PAGE,
  SHELLY_RESOURCES,
  SHELLY_SCHEDULE_ROW,
  SHELLY_SNAPSHOT,
  SHELLY_TRACKS,
  SHELLY_WEBHOOK_ROW,
} from '../src';

const INFO = {
  id: 'shellypresencegen4-aabbcc',
  mac: 'AABBCCDDEEFF',
  model: 'S4SN-0U61X',
  gen: 5,
  fw_id: '20260101-000000/1.8.0',
  ver: '1.8.0',
  app: 'PresenceG4',
  auth_en: false,
  future_field: 1,
};
const DEVICE = {
  id: INFO.id,
  externalId: `shelly-presence:${INFO.id}`,
  name: 'Shelly Presence',
  address: 'http://192.168.1.20',
  info: INFO,
  connection: { state: 'online', reason: null },
  observedAt: '2026-10-17T10:00:00.000Z',
  config: { enable: true, num_tracks: 40 },
  status: { errors: [] },
  revision: 3,
  zones: [
    {
      key: 'presencezone:200',
      externalId: 'shelly-presence:x',
      generation: 0,
      main: true,
      config: { id: 200, area: [[0, 0, 1, 1]] },
      status: { id: 200, value: true, num_objects: 1 },
    },
  ],
  light: [{ config: { id: 0 }, status: { id: 0, lux: 12, illumination: 'unknown_level' } }],
  tracks: [{ id: 1, x: 0.5, y: 1, z: 1.5 }],
  tracksAt: null,
  methods: ['Presence.GetConfig'],
  componentKeys: ['presence:0'],
  features: [{ id: 'a', page: 'presence-room', available: true, reason: null }],
  components: [{ component: 'wifi', key: 'wifi', config: { sta: { ssid: 'home' } }, status: null }],
  discoveredBthome: [{ addr: 'AA:BB:CC:DD:EE:FF', rssi: -50, encrypted: false }],
};

describe('device reads', () => {
  it('accepts device info with extra fields and a newer generation', () => {
    expect(SHELLY_DEVICE_INFO.parse(INFO)).toMatchObject({ gen: 5, future_field: 1 });
  });

  it('accepts a sensor whose values are outside the old write limits', () => {
    const device = SHELLY_DEVICE.parse(DEVICE);
    expect(device.config?.num_tracks).toBe(40);
    expect(device.light[0]?.status?.illumination).toBe('unknown_level');
  });

  it('refuses a connection state the app cannot show', () => {
    expect(() =>
      SHELLY_DEVICE.parse({ ...DEVICE, connection: { state: 'exploded', reason: null } }),
    ).toThrow();
  });

  it('wraps devices in snapshots and tracks', () => {
    expect(
      SHELLY_SNAPSHOT.parse({ at: '2026-10-17T10:00:00.000Z', devices: [DEVICE] }).devices,
    ).toHaveLength(1);
    expect(
      SHELLY_TRACKS.parse({
        devices: [{ id: INFO.id, tracks: [{ id: 1, x: 0, y: 0, z: 0 }], tracksAt: null }],
      }).devices[0]?.tracks,
    ).toHaveLength(1);
  });
});

describe('schedules', () => {
  it('reads every call exactly as the device sent it', () => {
    const calls = [
      { method: 'Script.Start', params: { id: 1 } },
      { method: 'MQTT.SetConfig', params: { config: { pass: 'x' } } },
      { method: 'Shelly.Reboot' },
    ];
    const row = SHELLY_SCHEDULE_ROW.parse({ id: 1, enable: true, timespec: '0 0 * * *', calls });
    expect(row.calls).toEqual(calls);
  });
});

describe('webhooks', () => {
  const hook = { id: 1, event: 'presence.enter', cid: 0 };

  it('reads destinations exactly as the device sent them', () => {
    const urls = ['http://192.168.1.2/hook?state=${ev.value}#x', 'http://u:p@192.168.1.3/'];
    expect(SHELLY_WEBHOOK_ROW.parse({ ...hook, urls }).urls).toEqual(urls);
  });
});

describe('stored values', () => {
  it('reads a keyed page and fills the offset and total', () => {
    const page = SHELLY_KVS_PAGE.parse({ items: { a: { etag: 'e', value: 1 } } });
    expect(page).toMatchObject({ items: { a: { etag: 'e', value: 1 } }, offset: 0, total: 1 });
  });

  it('reads a listed page', () => {
    const page = SHELLY_KVS_PAGE.parse({
      items: [{ key: 'a', etag: 'e', value: 'x' }],
      offset: 2,
      total: 9,
    });
    expect(page).toMatchObject({ items: { a: { etag: 'e', value: 'x' } }, offset: 2, total: 9 });
  });
});

describe('resources', () => {
  it('reads schedules, hooks, types and scripts together', () => {
    const resources = SHELLY_RESOURCES.parse({
      schedules: { jobs: [], rev: 2 },
      webhooks: { hooks: [], rev: 1 },
      webhookTypes: { types: [{ 'presence.enter': { attrs: [{ name: 'a', type: 'number' }] } }] },
      scripts: { scripts: [{ id: 1, running: false, status: { id: 1, running: false } }] },
    });
    expect(resources.scripts?.scripts[0]?.id).toBe(1);
    expect(resources.webhookTypes?.types).toHaveLength(1);
  });
});
