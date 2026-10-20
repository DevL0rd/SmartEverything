import { describe, expect, it } from 'vitest';
import {
  BRUSH_ACTION,
  BRUSH_DIAGNOSTICS_VIEW,
  BRUSH_FRAME_BATCH,
  BRUSH_LINK_PLAN,
  BRUSH_MODES,
  BRUSH_MODE_LABELS,
  BRUSH_PROFILE,
  BRUSH_SETTINGS,
  BRUSH_SETTINGS_CHANGE,
  LOCAL_DEVICE_SETUP,
  LOCAL_DRIVERS,
  ORALB_CHARACTERISTICS,
  ORALB_DEFAULT_MODEL,
  ORALB_IDENTITY,
  ORALB_MODES,
  ORALB_MODE_ANGLES,
  ORALB_MODE_IDS,
  ORALB_MODE_LABELS,
  ORALB_PROBES,
  ORALB_RING_COLOURS,
  ORALB_RING_NAMES,
  ORALB_SETTINGS,
  SONICARE_MODES,
  brushSettingsOf,
  deviceFamily,
  oralbActivityOf,
  oralbDefaultModelOf,
  oralbExternalId,
  oralbHeadWear,
  oralbModeOf,
  oralbModelKey,
  oralbProfileOf,
  oralbRingDisplayOf,
  oralbRingOf,
  oralbRoutineOf,
  sleepsBetweenUse,
  type OralbCharacteristic,
  type OralbIdentity,
} from '../src';

const QUADRANTS = [30, 30, 30, 30, 0, 0, 0, 0];

function identity(values: Partial<OralbIdentity> = {}): OralbIdentity {
  return ORALB_IDENTITY.parse({
    address: 'A0:14:3D:11:22:33',
    advertAddress: 'A0:14:3D:11:22:33',
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    gapName: 'Oral-B Toothbrush',
    services: [],
    present: [...ORALB_CHARACTERISTICS],
    ff05Length: 8,
    ff05Runtime: null,
    ff0bLength: 10,
    ff2bLength: 4,
    ff2dLength: 5,
    advertHex: '08365208320000050001 00'.replaceAll(' ', ''),
    clock: 1_790_000_000,
    ...values,
  });
}

function without(...suffixes: OralbCharacteristic[]): OralbCharacteristic[] {
  return ORALB_CHARACTERISTICS.filter((suffix) => !suffixes.includes(suffix));
}

describe('what an Oral-B handle can do', () => {
  it('reads force, extended battery, the handle record and the head countdown on protocol 8', () => {
    expect(oralbProfileOf(identity(), QUADRANTS)).toStrictEqual({
      brand: 'oralb',
      protocol: 8,
      modelId: 0x36,
      pressure: 'force',
      battery: 'extended',
      history: 'retained',
      face: 'display',
      ring: true,
      head: 'countdown',
      sectors: 4,
      zones: 4,
      zoneSource: 'pacer',
      writes: false,
      motion: false,
    });
  });

  it('reads a pressure state, a runtime or a percent on protocol 6 and keeps only observed sessions', () => {
    const six = identity({ protocol: 6, ff05Length: 3, ff05Runtime: 0, ff0bLength: 1 });
    expect(oralbProfileOf(six, QUADRANTS)).toMatchObject({
      protocol: 6,
      pressure: 'state',
      battery: 'percent',
      history: 'observed_only',
    });
    expect(oralbProfileOf({ ...six, ff05Runtime: 5400 }, QUADRANTS).battery).toBe('runtime');
    expect(oralbProfileOf({ ...six, ff05Length: 1 }, QUADRANTS).battery).toBe('percent');
  });

  it('keeps the handle record for protocols 7 and 9 and drops everything for an unknown protocol', () => {
    expect(oralbProfileOf(identity({ protocol: 7 }), QUADRANTS).history).toBe('retained');
    expect(oralbProfileOf(identity({ protocol: 9 }), QUADRANTS).history).toBe('retained');
    const unknown = oralbProfileOf(identity({ protocol: 3 }), QUADRANTS);
    expect(unknown).toMatchObject({ protocol: null, history: 'observed_only' });
    expect(unknown.writes).toBe(false);
  });

  it('takes the face from the advert and loses the head countdown when the characteristics are missing', () => {
    const iO5 = identity({
      protocol: 7,
      present: without('FF0A', 'FF2B', 'FF2D'),
      ff2bLength: null,
      ff2dLength: null,
    });
    expect(oralbProfileOf(iO5, QUADRANTS)).toMatchObject({
      face: 'advert',
      ring: false,
      head: 'none',
    });
    expect(oralbProfileOf(identity({ ff2bLength: 3, ff2dLength: 4 }), null)).toMatchObject({
      ring: false,
      head: 'none',
    });
  });

  it('counts sectors from the pacer schedule and offers quadrants only for four', () => {
    expect(oralbProfileOf(identity(), null)).toMatchObject({ sectors: 0, zones: 0 });
    expect(oralbProfileOf(identity(), [0, 0, 0, 0, 0, 0, 0, 0])).toMatchObject({
      sectors: 0,
      zones: 0,
    });
    expect(oralbProfileOf(identity(), [20, 20, 20, 20, 20, 20, 0, 0])).toMatchObject({
      sectors: 6,
      zones: 0,
    });
    expect(
      oralbProfileOf(
        identity(),
        Array.from({ length: 12 }, () => 10),
      ).sectors,
    ).toBe(8);
  });

  it('joins the shared profile union under the brand', () => {
    const profile = oralbProfileOf(identity(), QUADRANTS);
    expect(BRUSH_PROFILE.parse(profile)).toStrictEqual(profile);
    expect(BRUSH_PROFILE.safeParse({ ...profile, writes: true }).success).toBe(false);
  });
});

describe('the modes of the handle', () => {
  it('names nine modes with their handle ids and labels', () => {
    expect(ORALB_MODES.map((mode) => ORALB_MODE_IDS[mode])).toStrictEqual([
      0, 1, 2, 3, 4, 5, 6, 11, 12,
    ]);
    expect(ORALB_MODES.map((mode) => ORALB_MODE_LABELS[mode])).toStrictEqual([
      'Daily Clean',
      'Sensitive',
      'Gum Care',
      'Whiten',
      'Intense',
      'Super Sensitive',
      'Tongue Clean',
      'Smart Adapt',
      'Gentle White',
    ]);
  });

  it('turns ids into modes and leaves off, the menu and unknown ids unnamed', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 11, 12].map(oralbModeOf)).toStrictEqual([...ORALB_MODES]);
    expect([7, 8, 9, 10, 13, 255].map(oralbModeOf)).toStrictEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('knows the published oscillation angles only', () => {
    expect(ORALB_MODE_ANGLES).toStrictEqual({ daily_clean: 28, sensitive: 20, intense: 33 });
  });

  it('shares one mode list with Sonicare where the names meet', () => {
    expect(new Set(BRUSH_MODES).size).toBe(BRUSH_MODES.length);
    expect(new Set(BRUSH_MODES)).toStrictEqual(new Set([...SONICARE_MODES, ...ORALB_MODES]));
    for (const mode of BRUSH_MODES) {
      expect(BRUSH_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
    expect(BRUSH_MODE_LABELS.sensitive).toBe('Sensitive');
  });
});

describe('the SmartRing colours', () => {
  it('names the six captured colours and anything else custom', () => {
    expect(ORALB_RING_NAMES.map((name) => oralbRingOf(ORALB_RING_COLOURS[name]))).toStrictEqual([
      ...ORALB_RING_NAMES,
    ]);
    expect(oralbRingOf([0x44, 0xcf, 0x63, 0x00])).toBe('white');
    expect(oralbRingOf([1, 2, 3, 4])).toBe('custom');
    expect(oralbRingOf([])).toBe('custom');
  });

  it('scales the drive levels so the white calibration shows as white', () => {
    expect(oralbRingDisplayOf(ORALB_RING_COLOURS.white)).toStrictEqual([255, 255, 255]);
    expect(oralbRingDisplayOf([0x80, 0xff, 0x00])).toStrictEqual([255, 255, 0]);
    expect(oralbRingDisplayOf([0x22, 0x66, 0x31])).toStrictEqual([128, 126, 126]);
    expect(oralbRingDisplayOf([])).toStrictEqual([0, 0, 0]);
  });
});

describe('the head reminder', () => {
  it('has no wear without a baseline', () => {
    expect(oralbHeadWear(20, 500, null)).toBeNull();
  });

  it('measures wear against the days at the last reset', () => {
    const baseline = { days: 30, seconds: 600 };
    expect(oralbHeadWear(30, 600, baseline)).toBe(0);
    expect(oralbHeadWear(15, 300, baseline)).toBe(50);
    expect(oralbHeadWear(0, 0, baseline)).toBe(100);
    expect(oralbHeadWear(40, 600, baseline)).toBe(0);
    expect(oralbHeadWear(-5, 600, baseline)).toBe(100);
  });

  it('falls back to the brushing seconds when the baseline has no days', () => {
    expect(oralbHeadWear(0, 150, { days: 0, seconds: 600 })).toBe(75);
    expect(oralbHeadWear(0, 150, { days: 0, seconds: 0 })).toBeNull();
  });
});

describe('the routine and the activity', () => {
  it('adds up the pacer schedule and is empty when the pacer is off', () => {
    expect(oralbRoutineOf(QUADRANTS)).toBe(120);
    expect(oralbRoutineOf([0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
    expect(oralbRoutineOf([])).toBeNull();
  });

  it('maps handle states to activities', () => {
    expect(oralbActivityOf(115, false)).toBe('asleep');
    expect(oralbActivityOf(116, false)).toBe('off');
    expect(oralbActivityOf(3, false)).toBe('brushing');
    expect(oralbActivityOf(4, false)).toBe('charging');
    expect([2, 1, 5, 6, 7, 9, 10, 0, 113].map((state) => oralbActivityOf(state, false))).toEqual(
      Array.from({ length: 9 }, () => 'standby'),
    );
    expect(oralbActivityOf(8, false)).toBe('standby');
    expect(oralbActivityOf(8, true)).toBe('brushing');
  });
});

describe('what names an Oral-B handle', () => {
  it('keys the model by its id in hex and the device by its identity address', () => {
    expect(oralbModelKey({ modelId: 0x32 })).toBe('oralb.toothbrush.io32');
    expect(oralbModelKey({ modelId: 0x6 })).toBe('oralb.toothbrush.io06');
    expect(oralbExternalId({ address: 'A0:14:3D:11:22:33' })).toBe('oralb_io:A0:14:3D:11:22:33');
  });

  it('resolves to the toothbrush family, which sleeps between uses', () => {
    const device = { kind: 'other', model: oralbModelKey({ modelId: 0x32 }) } as const;
    expect(deviceFamily(device)).toBe('toothbrush');
    expect(sleepsBetweenUse(device)).toBe(true);
  });

  it('prefills iO9 for the iO9 model ids only', () => {
    expect([0x31, 0x32, 0x36].map(oralbDefaultModelOf)).toStrictEqual(['iO9', 'iO9', 'iO9']);
    expect(oralbDefaultModelOf(0x34)).toBe('iO');
  });

  it('is a local driver with its own setup', () => {
    expect(LOCAL_DRIVERS).toContain('oralb_io');
    const setup = {
      driver: 'oralb_io',
      source: 'bluetooth',
      name: 'Bathroom',
      room: null,
      profileId: null,
      identity: identity(),
    };
    expect(LOCAL_DEVICE_SETUP.parse(setup)).toMatchObject({ driver: 'oralb_io' });
    expect(LOCAL_DEVICE_SETUP.safeParse({ ...setup, identity: { address: 'x' } }).success).toBe(
      false,
    );
  });
});

describe('the settings blocks', () => {
  it('gives the Oral-B block its defaults', () => {
    expect(ORALB_SETTINGS.parse({})).toStrictEqual({
      live: 'broadcast',
      headWarnDays: 14,
      headDueDays: 0,
      handleColour: 'black',
      model: ORALB_DEFAULT_MODEL,
      probes: {},
      forceBands: null,
      headBaseline: null,
      headLast: null,
      missed: [],
    });
  });

  it('keeps the Sonicare settings as they were and adds the Oral-B block for an Oral-B only', () => {
    const sonicare = brushSettingsOf(undefined);
    expect(sonicare.oralb).toBeNull();
    expect(sonicare.sensors.pressure).toBe(true);
    const oralb = brushSettingsOf({ personId: 'sam' }, 'oralb');
    expect(oralb).toMatchObject({ personId: 'sam', oralb: { live: 'broadcast' } });
    expect(brushSettingsOf({ oralb: { live: 'connected' } }, 'oralb').oralb?.live).toBe(
      'connected',
    );
    expect(BRUSH_SETTINGS.parse(oralb)).toStrictEqual(oralb);
  });

  it('records probe results with the firmware they ran on and refuses unknown probes', () => {
    const settings = ORALB_SETTINGS.parse({
      probes: {
        advert_log: { passedAt: '2026-10-18T09:00:00.000Z', firmware: 82 },
        ring_write: { failedAt: '2026-10-18T09:05:00.000Z', firmware: 82, reason: 'unchanged' },
      },
    });
    expect(Object.keys(settings.probes)).toStrictEqual(['advert_log', 'ring_write']);
    expect(ORALB_PROBES).toHaveLength(9);
    expect(
      ORALB_SETTINGS.safeParse({ probes: { reboot: { passedAt: 'x', firmware: 1 } } }).success,
    ).toBe(false);
  });

  it('takes an empty settings change as no change at all', () => {
    expect(BRUSH_SETTINGS_CHANGE.parse({})).toStrictEqual({});
    expect(BRUSH_SETTINGS_CHANGE.parse({ alerts: { counterfeitWarning: false } })).toStrictEqual({
      alerts: { counterfeitWarning: false },
    });
    expect(BRUSH_SETTINGS_CHANGE.parse({ sensors: { motion: true } })).toStrictEqual({
      sensors: { motion: true },
    });
  });

  it('limits the missed list and takes changes to the live mode and head thresholds', () => {
    const missed = Array.from({ length: 31 }, (_, index) => ({
      handleSessionId: index,
      startedAt: '2026-10-18T09:00:00.000Z',
    }));
    expect(ORALB_SETTINGS.safeParse({ missed }).success).toBe(false);
    expect(
      BRUSH_SETTINGS_CHANGE.parse({ oralb: { live: 'connected', headWarnDays: 7 } }),
    ).toStrictEqual({ oralb: { live: 'connected', headWarnDays: 7 } });
    expect(BRUSH_SETTINGS_CHANGE.safeParse({ oralb: { probes: {} } }).success).toBe(false);
  });
});

describe('the contract for an Oral-B handle', () => {
  it('lets a link plan read adverts and a post-session list', () => {
    const plan = BRUSH_LINK_PLAN.parse({
      deviceId: '11111111-1111-4111-8111-111111111111',
      address: 'A0:14:3D:11:22:33',
      transport: 'gatt',
      brand: 'oralb',
      bonded: false,
      adverts: { companyId: 220 },
      prepare: [],
      subscriptions: [],
      reads: [],
      sync: [
        {
          service: 'a0f0ff00-5047-4d53-8208-4f72616c2d42',
          characteristic: 'a0f0ff29-5047-4d53-8208-4f72616c2d42',
        },
      ],
      initial: [],
      policy: 'on_demand',
      holder: true,
    });
    expect(plan.adverts).toStrictEqual({ companyId: 220 });
    expect(plan.sync).toHaveLength(1);
  });

  it('carries adverts in a frame batch and still takes a batch without them', () => {
    const link = { phase: 'searching', rssi: -60, detail: null } as const;
    expect(BRUSH_FRAME_BATCH.parse({ frames: [], link }).adverts).toBeUndefined();
    expect(
      BRUSH_FRAME_BATCH.parse({
        frames: [],
        adverts: [{ at: '2026-10-18T09:00:00.000Z', rssi: -60, hex: '0836' }],
        link,
      }).adverts,
    ).toHaveLength(1);
  });

  it('names the new actions', () => {
    expect(
      BRUSH_ACTION.parse({ action: 'set_mode_order', modes: ['whiten', 'daily_clean'] }),
    ).toMatchObject({
      action: 'set_mode_order',
    });
    expect(BRUSH_ACTION.parse({ action: 'reset_head_reminder' }).action).toBe(
      'reset_head_reminder',
    );
    expect(BRUSH_ACTION.parse({ action: 'snooze_head_reminder' }).action).toBe(
      'snooze_head_reminder',
    );
    expect(BRUSH_ACTION.parse({ action: 'probe', probe: 'ring_write' })).toMatchObject({
      probe: 'ring_write',
    });
    expect(BRUSH_ACTION.safeParse({ action: 'probe', probe: 'reboot' }).success).toBe(false);
    expect(BRUSH_ACTION.safeParse({ action: 'set_mode_order', modes: ['clean'] }).success).toBe(
      false,
    );
  });

  it('describes an Oral-B in the diagnostics view under its brand', () => {
    const link = {
      phase: 'linked',
      holderName: null,
      holderIsYou: false,
      rssi: null,
      lastHeardAt: null,
      detail: null,
      fetching: 0,
    };
    const view = BRUSH_DIAGNOSTICS_VIEW.parse({
      view: 'diagnostics',
      profile: oralbProfileOf(identity(), QUADRANTS),
      link,
      brand: {
        brand: 'oralb',
        identity: identity(),
        probes: {},
        forceBands: { lightBelow: 0.5, highAbove: 2.5, samples: 3 },
        headBaseline: null,
        advertIntervalMs: 250,
        liveSource: 'advert',
        filterRegistered: true,
        records: [],
      },
      rawLog: { enabled: false, frames: [] },
    });
    expect(view.brand.brand).toBe('oralb');
    expect(
      BRUSH_DIAGNOSTICS_VIEW.safeParse({ ...view, brand: { brand: 'sonicare', identity: {} } })
        .success,
    ).toBe(false);
  });
});

describe('the routine length of a pacer schedule', () => {
  it('counts the used sectors and ignores the unused 255 slots', () => {
    expect(oralbRoutineOf([30, 30, 30, 30, 255, 255, 255, 255])).toBe(120);
    expect(oralbRoutineOf([30, 255, 255, 255, 255, 255, 255, 255])).toBe(30);
    expect(oralbRoutineOf([255, 255, 255, 255, 255, 255, 255, 255])).toBeNull();
    expect(oralbRoutineOf([0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
