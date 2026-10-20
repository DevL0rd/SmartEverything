import { DISCOVERED_DEVICE, waterEntryOf } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreConflictError } from '../../../src/store/sql';
import { larqBottleDriver } from '../../../src/local/bottle/driver';
import { bottleSetup } from '../../../src/local/bottle/setup';
import { sweepBottleRetention } from '../../../src/store/bottle-retention';
import {
  BottleReadingsRepository,
  type StoredReading,
} from '../../../src/store/repositories/bottle-readings';
import { DevicesRepository } from '../../../src/store/repositories/devices';
import { countedStore } from '../../support/counted-store';
import { captureLogs } from '../../support/logs';
import { bottleRig, type BottleRig } from '../../support/bottle-rig';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

const SETUP = {
  driver: 'larq_bottle',
  source: 'bluetooth',
  name: 'Kitchen bottle',
  serial: '0123456789ABCDEF',
  room: 'Kitchen',
  profileId: null,
  body: 1000,
  filter: true,
  dis: null,
} as const;

const MOMENT = { now: new Date('2026-10-18T12:00:00.000Z'), today: '2026-10-18' };

describe('adding a bottle', () => {
  it('names the model from what the cap says about itself', () => {
    expect(bottleSetup(SETUP, MOMENT).entry.config['model']).toBe('larq.bottle.purevis2');
    const brita = bottleSetup(
      {
        ...SETUP,
        dis: {
          manufacturer: 'BRITA',
          model: 'iQ cap',
          serial: null,
          firmware: null,
          hardware: null,
          software: null,
        },
      },
      MOMENT,
    );
    expect(brita.entry.config['model']).toBe('larq.bottle.iq');
  });

  it('keys the bottle by its serial, never by a changing address, and starts the filter today', () => {
    const resolved = bottleSetup(SETUP, MOMENT);
    expect(resolved.entry).toMatchObject({
      externalId: 'larq_bottle:0123456789ABCDEF',
      address: '0123456789ABCDEF',
      driver: 'larq_bottle',
    });
    expect(resolved.key).toBeNull();
    expect(resolved.entry.config['filter']).toStrictEqual({
      installed: true,
      type: 'essential',
      installedOn: '2026-10-18',
    });
    expect(resolved.entry.config['binding']).toMatchObject({ profileId: null });
  });

  it('describes itself to the home as a valid device with the serial only in its id', () => {
    const device = DISCOVERED_DEVICE.parse(
      larqBottleDriver.describe(rig.entry(), { lastSyncAt: '2026-10-18T12:00:00.000Z' }),
    );
    expect(device).toMatchObject({
      model: 'larq.bottle.purevis2',
      manufacturer: 'larq',
      kind: 'other',
      online: true,
    });
    expect(device.capabilities.map((capability) => capability.key)).toContain('uv_clean');
    expect(device.details['serial']).toBe('…CDEF');
    expect(JSON.stringify({ ...device, externalId: '' })).not.toContain('0123456789ABCDEF');
    expect(device.details['lastSyncAt']).toBe('2026-10-18T12:00:00.000Z');
  });

  it('names the person it belongs to so each app can pick its own bottle', () => {
    const device = DISCOVERED_DEVICE.parse(larqBottleDriver.describe(rig.entry(), {}));
    expect(device.details['personId']).toBe(rig.owner.profile.id);
  });

  it('lets a clean be stopped by a command but not started', () => {
    const device = DISCOVERED_DEVICE.parse(larqBottleDriver.describe(rig.entry(), {}));
    const uv = device.capabilities.find((capability) => capability.key === 'uv_clean');
    expect(uv).toMatchObject({ access: 'write', value: { kind: 'enum', options: ['stop'] } });
  });
});

describe('the water entries of a bottle', () => {
  const span = {
    startTime: '2026-10-18T10:00:00.000Z',
    endTime: '2026-10-18T10:01:00.000Z',
    zoneOffsetSeconds: 0,
  };

  it('can exist only once for a reading, even after the person deletes it', () => {
    const { store } = rig.test;
    const profileId = rig.owner.profile.id;
    const first = store.healthEntries.create(profileId, waterEntryOf(200, span), {
      source: 'larq',
      key: 'S:1',
    });
    expect(first.source).toBe('larq');
    expect(() =>
      store.healthEntries.create(profileId, waterEntryOf(200, span), {
        source: 'larq',
        key: 'S:1',
      }),
    ).toThrow(StoreConflictError);
    store.healthEntries.create(profileId, waterEntryOf(200, span));
    store.healthEntries.create(profileId, waterEntryOf(200, span));
  });
});

describe('the housekeeping of old rows', () => {
  it('forgets readings older than 400 days and keeps what is newer', async () => {
    const counted = await countedStore(() => new Date('2026-10-18T12:00:00.000Z'));
    try {
      const devices = new DevicesRepository(counted.context);
      const [device] = devices.upsert([
        {
          provider: 'local',
          externalId: 'larq_bottle:0123456789ABCDEF',
          parentId: null,
          kind: 'other',
          name: 'Bottle',
          model: 'larq.bottle.purevis2',
          manufacturer: 'larq',
          providerRoom: null,
          roomId: null,
          online: true,
          capabilities: [],
          details: {},
        },
      ]);
      const readings = new BottleReadingsRepository(counted.context);
      const row = (at: number): StoredReading => ({
        at,
        trigger: 'cap',
        distanceMm: 50,
        kcps: 6000,
        ledOhm: 0,
        verdict: 'accepted',
        volumeMl: 500,
        kind: 'small',
        eventMl: null,
        drunkMl: null,
      });
      const now = new Date('2026-10-18T12:00:00.000Z');
      const day = 86_400;
      const seconds = Math.floor(now.getTime() / 1000);
      readings.insert(device?.id ?? '', row(seconds - 401 * day));
      readings.insert(device?.id ?? '', row(seconds - 399 * day));
      expect(sweepBottleRetention(counted.sql, now)['bottle_readings']).toBe(1);
      expect(readings.all(device?.id ?? '').map((kept) => kept.at)).toStrictEqual([
        seconds - 399 * day,
      ]);
    } finally {
      await counted.close();
    }
  });
});
