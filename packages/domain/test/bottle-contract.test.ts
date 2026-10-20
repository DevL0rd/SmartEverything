import { describe, expect, it } from 'vitest';
import {
  API_ENDPOINTS,
  BOTTLE_ACTION,
  BOTTLE_CAPABILITY_CATALOGUE,
  BOTTLE_DEVICE_INFORMATION,
  BOTTLE_READ_QUERY,
  BOTTLE_SYNC_PLAN,
  BOTTLE_SYNC_UPLOAD,
  BottleSerialError,
  CAPABILITY_CATALOGUE,
  LOCAL_DEVICE_SETUP,
  PHONE_BOTTLES,
  PUSH_COMMANDS,
  PUSH_COMMANDS_OVER_LIVE,
  bottleExternalId,
  bottleSerialOf,
  deviceFamily,
  maskedSerial,
  sleepsBetweenUse,
  type PresentableDevice,
} from '../src';

const SERIAL = '0123456789ABCDEF';

const MOMENT = '2026-10-18T12:00:00.000Z';

const BOTTLE: PresentableDevice = { kind: 'other', model: 'larq.bottle.purevis2' };

describe('bottle identity', () => {
  it('builds the external id from the sixteen digit serial and reads it back', () => {
    expect(bottleExternalId(SERIAL)).toBe('larq_bottle:0123456789ABCDEF');
    expect(bottleSerialOf('larq_bottle:0123456789ABCDEF')).toBe(SERIAL);
  });

  it('refuses a serial that is not sixteen upper-case hexadecimal digits', () => {
    expect(() => bottleExternalId('abc')).toThrow();
    expect(() => bottleSerialOf('larq_bottle:xyz')).toThrow(BottleSerialError);
    expect(() => bottleSerialOf('xiaomi_scale:0123456789ABCDEF')).toThrow(/larq_bottle/u);
  });

  it('masks the serial except for its last four digits', () => {
    expect(maskedSerial(SERIAL)).toBe('…CDEF');
  });
});

describe('bottle as a device', () => {
  it('is its own family, and sleeps between uses', () => {
    expect(deviceFamily(BOTTLE)).toBe('bottle');
    expect(sleepsBetweenUse(BOTTLE)).toBe(true);
  });

  it('declares every capability in the catalogue, in the water group except the last seen', () => {
    for (const [key, entry] of Object.entries(BOTTLE_CAPABILITY_CATALOGUE)) {
      expect(CAPABILITY_CATALOGUE).toHaveProperty(key);
      expect(entry.group).toBe(key === 'last_seen' ? 'system' : 'water');
    }
  });

  it('can be added as a local device with its serial and body', () => {
    const setup = {
      driver: 'larq_bottle',
      source: 'bluetooth',
      name: 'Kitchen bottle',
      serial: SERIAL,
      room: 'Kitchen',
      profileId: null,
      body: 680,
      filter: false,
      dis: null,
    };
    expect(LOCAL_DEVICE_SETUP.parse(setup)).toStrictEqual(setup);
    expect(LOCAL_DEVICE_SETUP.safeParse({ ...setup, body: 500 }).success).toBe(false);
    expect(LOCAL_DEVICE_SETUP.safeParse({ ...setup, serial: 'abc' }).success).toBe(false);
  });
});

describe('bottle sync contract', () => {
  const plan = {
    serial: SERIAL,
    steps: [
      { kind: 'gatt_read', name: 'battery', what: 'battery' },
      { kind: 'set_time', name: 'set_time' },
      { kind: 'request', name: 'ui_state', requestHex: '0d01000000', gate: null },
      { kind: 'log', name: 'log_tof', log: 'tof', fromTimestamp: 0, limit: 5 },
    ],
  };

  it('accepts a plan of the four kinds of step and nothing else', () => {
    expect(BOTTLE_SYNC_PLAN.parse(plan)).toStrictEqual(plan);
    expect(
      BOTTLE_SYNC_PLAN.safeParse({ ...plan, steps: [{ kind: 'reset', name: 'x' }] }).success,
    ).toBe(false);
    expect(BOTTLE_SYNC_PLAN.safeParse({ ...plan, steps: [] }).success).toBe(false);
  });

  it('lists the bottles of a phone with their plans', () => {
    const phone = {
      bottles: [
        { deviceId: '8a1b3c2d-0000-4000-8000-000000000001', serial: SERIAL, name: 'Bottle', plan },
      ],
    };
    expect(PHONE_BOTTLES.parse(phone)).toStrictEqual(phone);
  });

  it('accepts an upload with raw answers and refuses one with an unknown field', () => {
    const upload = {
      trigger: 'wake',
      startedAt: MOMENT,
      endedAt: MOMENT,
      outcome: 'ok',
      detail: null,
      rssi: -58,
      dis: BOTTLE_DEVICE_INFORMATION.parse({
        manufacturer: 'LARQ',
        model: 'PureVis 2',
        serial: SERIAL,
        firmware: '2.3.1',
        hardware: null,
        software: null,
      }),
      batteryReads: [{ at: MOMENT, pct: 61, pushed: false }],
      responses: [{ name: 'ui_state', at: MOMENT, hex: '0d01', timedOut: false }],
    };
    expect(BOTTLE_SYNC_UPLOAD.parse(upload)).toStrictEqual(upload);
    expect(BOTTLE_SYNC_UPLOAD.safeParse({ ...upload, extra: 1 }).success).toBe(false);
    expect(BOTTLE_SYNC_UPLOAD.safeParse({ ...upload, rssi: -300 }).success).toBe(false);
  });

  it('sends bottle actions to the phone over the live channel, as other phone actions are', () => {
    expect(PUSH_COMMANDS).toContain('bottle_action');
    expect(PUSH_COMMANDS_OVER_LIVE).toContain('bottle_action');
  });
});

describe('bottle API', () => {
  it('reads a view chosen by name, with limits as numbers from the query string', () => {
    expect(BOTTLE_READ_QUERY.parse({ view: 'readings', limit: '25' })).toStrictEqual({
      view: 'readings',
      limit: 25,
    });
    expect(BOTTLE_READ_QUERY.safeParse({ view: 'telemetry' }).success).toBe(false);
    expect(BOTTLE_READ_QUERY.safeParse({ view: 'drinks', limit: '500' }).success).toBe(false);
  });

  it('acts through one body that always names the action', () => {
    expect(
      BOTTLE_ACTION.parse({ action: 'set_reminder', reminder: { intervalMin: 45 } }),
    ).toStrictEqual({
      action: 'set_reminder',
      reminder: { intervalMin: 45 },
    });
    expect(
      BOTTLE_ACTION.safeParse({ action: 'set_reminder', reminder: { intervalMin: 44 } }).success,
    ).toBe(false);
    expect(BOTTLE_ACTION.safeParse({ action: 'uv_start' }).success).toBe(false);
    expect(BOTTLE_ACTION.safeParse({ action: 'set_calibration', points: [] }).success).toBe(false);
  });

  it('keeps the phone endpoints before the device endpoints so mine and action-results are not read as ids', () => {
    const paths = Object.values(API_ENDPOINTS)
      .map((definition) => definition.path)
      .filter((path) => path.startsWith('/api/bottles'));
    expect(paths.indexOf('/api/bottles/mine')).toBeLessThan(
      paths.indexOf('/api/bottles/:deviceId'),
    );
    expect(paths).toContain('/api/bottles/:deviceId/uv');
    expect(API_ENDPOINTS.startBottleUv.access).toBe('member');
  });
});
