import { ORALB_PROFILE, type LocalDeviceSetup } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { oralbBrand } from '../../../src/local/oralb/brand';
import { oralbCapabilities } from '../../../src/local/oralb/capabilities';
import { oralbContentFilters } from '../../../src/local/oralb/filters';
import { oralbDriver } from '../../../src/local/oralb/driver';
import { ForceBands } from '../../../src/local/oralb/force';
import { HeadTracker, isReset } from '../../../src/local/oralb/head';
import { LOCAL_DRIVER_REGISTRY } from '../../../src/local/drivers';
import {
  brushBrands,
  brushContentFilters,
  brushSetupFor,
} from '../../../src/local/toothbrush/brands';
import { actBrush, type Actor } from '../../../src/local/toothbrush/acts';
import { identityOf, oralbRig, type OralbRig } from './rig';

let rig: OralbRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function setupOf(values: Parameters<typeof identityOf>[0] = {}): LocalDeviceSetup {
  return {
    driver: 'oralb_io',
    source: 'bluetooth',
    name: 'Bathroom brush',
    room: 'Bathroom',
    profileId: null,
    identity: identityOf(values),
  };
}

describe('setting up an Oral-B brush', () => {
  it('stores the identity, the model key and the default marketing model', async () => {
    const resolved = await oralbBrand.setup(setupOf());
    expect(resolved.entry).toMatchObject({
      externalId: 'oralb_io:78:DB:2F:C2:48:BE',
      driver: 'oralb_io',
      address: '78:DB:2F:C2:48:BE',
      name: 'Bathroom brush',
      config: { model: 'oralb.toothbrush.io36', room: 'Bathroom', schedule: null },
    });
    expect(resolved.key).toBeNull();
    expect(resolved.entry.config['settings']).toMatchObject({
      oralb: { model: 'iO9', live: 'broadcast' },
    });
    expect(oralbBrand.profileOf({ ...resolved.entry, createdAt: '' })).toMatchObject({
      brand: 'oralb',
      protocol: 8,
      pressure: 'force',
      sectors: 0,
    });
  });

  it('refuses a protocol that is not an iO protocol and an address that changed', async () => {
    await expect(oralbBrand.setup(setupOf({ protocol: 5 }))).rejects.toThrow('not an iO protocol');
    await expect(oralbBrand.setup(setupOf({ advertAddress: '11:22:33:44:55:66' }))).rejects.toThrow(
      'does not match',
    );
  });

  it('is reached through the shared brand registry and refuses another brand’s request', async () => {
    const resolved = await brushSetupFor(setupOf());
    expect(resolved.entry.driver).toBe('oralb_io');
    await expect(
      oralbBrand.setup({
        driver: 'philips_sonicare',
        source: 'bluetooth',
        name: 'x',
        address: '24:E5:AA:00:00:03',
        room: null,
        profileId: null,
        modelKey: null,
        bonded: false,
        gatt: { name: 'x', services: [{ uuid: '180a', characteristics: [] }] },
      }),
    ).rejects.toThrow('not an Oral-B');
  });
});

describe('the brand in the registries', () => {
  it('is registered once, next to Sonicare, with a driver of its own', () => {
    expect(brushBrands().map((brand) => brand.driver)).toEqual(['philips_sonicare', 'oralb_io']);
    expect(LOCAL_DRIVER_REGISTRY.oralb_io).toBe(oralbDriver);
    expect(new Set(brushBrands().map((brand) => brand.driver)).size).toBe(brushBrands().length);
  });

  it('asks the phone to wake only for running and summary adverts', async () => {
    rig = await oralbRig();
    const entries = rig.test.store.localDevices.list();
    expect(oralbContentFilters([])).toEqual([]);
    expect(oralbContentFilters(entries)).toEqual([
      { companyId: 220, dataPrefix: '00000003', dataMask: '000000ff' },
      { companyId: 220, dataPrefix: '00000009', dataMask: '000000ff' },
      { companyId: 220, dataPrefix: '0000000a', dataMask: '000000ff' },
    ]);
    expect(brushContentFilters(entries)).toHaveLength(3);
  });

  it('describes the device with its capabilities, link and protocol', async () => {
    rig = await oralbRig();
    const entry = rig.test.store.localDevices.byExternalId(rig.device.external_id);
    const described = oralbDriver.describe(entry, {
      linkPhase: 'linked',
      protocol: 8,
      firmware: 82,
    });
    expect(described).toMatchObject({
      manufacturer: 'oralb',
      model: 'oralb.toothbrush.io36',
      online: true,
      details: {
        driver: 'oralb_io',
        protocol: 8,
        firmware: 82,
        marketingModel: 'iO9',
        pressure: 'force',
      },
    });
    expect(described?.details['address']).toBeUndefined();
    expect(described?.capabilities.map((capability) => capability.key)).toEqual(
      oralbCapabilities(entry).map((capability) => capability.key),
    );
  });

  it('offers only the capabilities this brush has', async () => {
    rig = await oralbRig({
      identity: identityOf({
        protocol: 6,
        present: ['FF05', 'FF0A', 'FF25', 'FF26', 'FF29'],
        ff05Length: 1,
        ff05Runtime: null,
        ff0bLength: 1,
        ff2bLength: null,
        ff2dLength: null,
      }),
    });
    const keys = oralbCapabilities(
      rig.test.store.localDevices.byExternalId(rig.device.external_id),
    ).map((capability) => capability.key);
    expect(keys).not.toContain('brush_ring_colour');
    expect(keys).not.toContain('brush_head_days_left');
    expect(keys).not.toContain('brush_charge_runtime');
    expect(keys).toContain('brush_pacer');
    expect(keys).toContain('battery');
  });

  it('keeps one profile shape that the shared views accept', async () => {
    rig = await oralbRig();
    const entry = rig.test.store.localDevices.byExternalId(rig.device.external_id);
    expect(ORALB_PROFILE.parse(oralbBrand.profileOf(entry)).writes).toBe(false);
  });
});

describe('changing the settings of an Oral-B brush', () => {
  it('saves the live mode, the head thresholds and the marketing model only in the Oral-B block', async () => {
    rig = await oralbRig({ settings: { consent: false } });
    const actor: Actor = {
      clientId: rig.owner.client.id,
      role: 'owner',
      profileId: rig.owner.profile.id,
      client: rig.owner.client,
      phone: true,
    };
    await actBrush(rig.acts(), rig.row(), actor, {
      action: 'configure',
      settings: { consent: true, oralb: { live: 'connected', headWarnDays: 7, model: 'iO10' } },
    });
    const entry = rig.test.store.localDevices.byExternalId(rig.device.external_id);
    expect(entry.config['settings']).toMatchObject({
      consent: true,
      model: null,
      defaultMode: null,
      oralb: { live: 'connected', headWarnDays: 7, headDueDays: 0, model: 'iO10' },
    });
    expect(entry.config['model']).toBe('oralb.toothbrush.io36');
  });
});

describe('learning the force bands', () => {
  it('takes the median of the last three sessions', () => {
    const bands = new ForceBands(null);
    const sessions = [
      [0.4, 3.2],
      [0.6, 3.0],
      [0.5, 2.8],
      [0.9, 4.0],
    ] as const;
    const learned = sessions.map(([light, high]) => {
      bands.note(0, light);
      bands.note(1, 2);
      bands.note(2, high);
      return bands.finish();
    });
    expect(learned[0]).toEqual({ lightBelow: 0.4, highAbove: 3.2, samples: 1 });
    expect(learned[2]).toEqual({ lightBelow: 0.5, highAbove: 3, samples: 3 });
    expect(learned[3]).toEqual({ lightBelow: 0.6, highAbove: 3, samples: 4 });
  });

  it('waits for both a light and a hard moment and ignores bands that cross', () => {
    const bands = new ForceBands(null);
    bands.note(0, 0.5);
    expect(bands.finish()).toBeNull();
    bands.note(2, 0.2);
    bands.note(0, 0.4);
    expect(bands.finish()).toBeNull();
    expect(bands.current).toBeNull();
  });
});

describe('telling a replaced head from a counting-down one', () => {
  it('sees a jump of more than a day or a minute as a reset', () => {
    const reading = { state: 0, days: 20, seconds: 500 };
    expect(isReset({ days: 20, seconds: 500 }, reading)).toBe(false);
    expect(isReset({ days: 19, seconds: 500 }, reading)).toBe(false);
    expect(isReset({ days: 18, seconds: 500 }, reading)).toBe(true);
    expect(isReset({ days: 20, seconds: 439 }, reading)).toBe(true);
  });

  it('counts from the baseline it was given after a restart', () => {
    const tracker = new HeadTracker({ days: 30, seconds: 600, at: '2026-10-01T00:00:00.000Z' });
    const update = tracker.update(
      { state: 0, days: 25, seconds: 500 },
      '2026-10-02T00:00:00.000Z',
      {
        warnDays: 14,
        dueDays: 0,
      },
    );
    expect(update.changed).toBe(false);
    expect(tracker.baseline).toMatchObject({ days: 30 });
    expect(tracker.drain()).toEqual([]);
  });

  it('sees a replaced head after a restart from the last reading it kept', () => {
    const tracker = new HeadTracker(
      { days: 30, seconds: 600, at: '2026-10-01T00:00:00.000Z' },
      { days: 3, seconds: 100 },
    );
    const update = tracker.update(
      { state: 0, days: 90, seconds: 1800 },
      '2026-10-20T00:00:00.000Z',
      { warnDays: 14, dueDays: 0 },
    );
    expect(update.changed).toBe(true);
    expect(tracker.baseline).toMatchObject({ days: 90, at: '2026-10-20T00:00:00.000Z' });
    expect(tracker.drain().map((event) => event.occurrence)).toEqual([
      'head:replaced:2026-10-20T00:00:00.000Z',
    ]);
  });

  it('does not warn while the reminder is off', () => {
    const tracker = new HeadTracker(null);
    tracker.update({ state: 255, days: 0, seconds: 0 }, '2026-10-02T00:00:00.000Z', {
      warnDays: 14,
      dueDays: 0,
    });
    expect(tracker.drain()).toEqual([]);
  });
});
