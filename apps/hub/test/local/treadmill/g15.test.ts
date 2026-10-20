import { identityOf } from '@smarteverything/ble';
import {
  MIN_BELT_KMH,
  TREADMILL_IDENTITY,
  type TreadmillFrame,
  type TreadmillGattDump,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { treadmillCapabilities } from '../../../src/local/treadmill/capabilities';
import { identityOfDevice, type TreadmillEntryConfig } from '../../../src/local/treadmill/config';
import { FigureAccumulator } from '../../../src/local/treadmill/figures';
import { liveFrameOf, type LiveState } from '../../../src/local/treadmill/live';
import { TreadmillRuntime } from '../../../src/local/treadmill/runtime';

const G15: TreadmillGattDump = {
  name: 'KS-SO-G15',
  services: [
    {
      uuid: '1826',
      characteristics: [
        { uuid: '2acc', properties: ['read'], value: '4816000044020000' },
        { uuid: '2ad4', properties: ['read'], value: '6400dc050a00' },
        { uuid: '2ad5', properties: ['read'], value: '0000c8000a00' },
      ],
    },
  ],
};

const SETTINGS = { weightKg: 70, gradePercent: 4, runSwitchKmh: 8 };

function capability(
  family: 'wilink' | 'ftms' | 'ftms_supplement',
  gatt: TreadmillGattDump,
  key: string,
): ReturnType<typeof treadmillCapabilities>[number] | undefined {
  return treadmillCapabilities(family, identityOf(gatt)).find((entry) => entry.key === key);
}

describe('the capabilities of a G15', () => {
  it('offers the incline with the step of its own range, only when the machine says it can incline', () => {
    expect(capability('ftms_supplement', G15, 'belt_incline')).toMatchObject({
      access: 'read_write',
      value: { kind: 'number', min: 0, step: 1, unit: '%' },
    });
    const without: TreadmillGattDump = {
      name: 'KS-SO-G15',
      services: [
        {
          uuid: '1826',
          characteristics: [
            { uuid: '2acc', properties: ['read'], value: '0100000001000000' },
            { uuid: '2ad5', properties: ['read'], value: '0000c8000a00' },
          ],
        },
      ],
    };
    expect(capability('ftms_supplement', without, 'belt_incline')).toBeUndefined();
  });

  it('shows the belt mode read only and no panel button on a fitness machine belt', () => {
    expect(capability('ftms_supplement', G15, 'belt_mode')?.access).toBe('read');
    expect(capability('ftms_supplement', G15, 'button')).toBeUndefined();
    expect(capability('wilink', G15, 'belt_mode')?.access).toBe('read_write');
    expect(capability('wilink', G15, 'button')).toBeDefined();
  });

  it('has a light strip switch on the supplement family only', () => {
    expect(capability('ftms_supplement', G15, 'belt_light')).toMatchObject({
      access: 'read_write',
      value: { kind: 'boolean' },
    });
    expect(capability('ftms', G15, 'belt_light')).toBeUndefined();
    expect(capability('wilink', G15, 'belt_light')).toBeUndefined();
  });

  it('starts the speed range at the 1 km/h of the belt', () => {
    expect(MIN_BELT_KMH).toBe(1);
    expect(capability('ftms_supplement', G15, 'belt_speed')).toMatchObject({
      value: { min: 1, max: 15 },
    });
  });
});

describe('an identity stored before the incline step was kept', () => {
  it('still parses and gets empty new fields', () => {
    const { modelCode, inclineStepPercent, ...old } = identityOf(G15);
    expect(modelCode).toBeNull();
    expect(inclineStepPercent).toBe(1);
    expect(TREADMILL_IDENTITY.parse(old)).toMatchObject({
      modelCode: null,
      inclineStepPercent: null,
    });
  });
});

describe('the identity of a stored G15', () => {
  const config: TreadmillEntryConfig = {
    model: 'kingsmith.treadmill.ksg15',
    room: null,
    family: 'ftms_supplement',
    gatt: G15,
    settings: undefined,
  };

  it('takes the incline range and step from the stored Bluetooth reply and keeps what was learned later', () => {
    const { inclineStepPercent, ...stored } = {
      ...identityOf(G15),
      motorVersion: 12,
      protocol: 1,
      capabilityWord: 6,
    };
    expect(inclineStepPercent).toBe(1);
    const identity = identityOfDevice(config.gatt, stored);
    expect(identity).toMatchObject({
      inclineMinPercent: 0,
      inclineMaxPercent: 20,
      inclineStepPercent: 1,
      motorVersion: 12,
      protocol: 1,
      capabilityWord: 6,
    });
    expect(
      treadmillCapabilities('ftms_supplement', identity).find(
        (entry) => entry.key === 'belt_incline',
      ),
    ).toMatchObject({
      access: 'read_write',
      value: { kind: 'number', min: 0, max: 20, step: 1, unit: '%' },
    });
  });

  it('builds the identity from the reply alone when nothing was stored', () => {
    expect(identityOfDevice(config.gatt, undefined)).toStrictEqual(identityOf(G15));
  });
});

function frame(characteristic: string, hex: string, seconds: number): TreadmillFrame {
  return {
    at: new Date(Date.parse('2026-10-18T10:00:00.000Z') + seconds * 1000).toISOString(),
    characteristic,
    hex,
  };
}

function walkingBelt(): { readonly runtime: TreadmillRuntime; readonly state: LiveState } {
  const runtime = new TreadmillRuntime({
    family: 'ftms_supplement',
    identity: identityOf(G15),
    pad: {},
  });
  const state: LiveState = {
    runtime,
    cadence: null,
    link: { phase: 'linked', rssi: -50, reconnects: 0, detail: null, heardAt: null },
    keeper: { figures: () => new FigureAccumulator(FIGURES).figures(null) },
  };
  return { runtime, state };
}

const SUPPLEMENT = '24e2521c-f63b-48ed-85be-c5330b00fdf7';

function supplementHex(first: number, second: number, data: readonly number[]): string {
  const body = [first, second, data.length, ...data];
  const sum = body.reduce((total, byte) => total + byte, 0) & 0xff;
  return [...body, sum].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function beltData(kcal: number, heartRate: number): string {
  return [
    '8401',
    '2c01',
    '140000',
    kcal.toString(16).padStart(2, '0') + '00',
    '0000',
    '00',
    heartRate.toString(16).padStart(2, '0'),
  ].join('');
}

const WALKER = { profileId: 'p1', weightKg: 70 } as const;

const FIGURES = {
  scale: 'unconfirmed',
  weightKg: 70,
  runSwitchKmh: 8,
  fixedGradePercent: null,
} as const;

describe('the belt’s own heart rate and energy', () => {
  it('shows the grip heart rate and the belt energy, and falls back to the watch when the hands leave', () => {
    const { runtime, state } = walkingBelt();
    runtime.ingest(
      [
        frame('2ada', '04', 0),
        frame('2acd', beltData(10, 110), 1),
        frame('2acd', beltData(20, 110), 2),
      ],
      SETTINGS,
    );
    const at = '2026-10-18T10:00:02.000Z';
    const gripped = liveFrameOf(
      { state, at, walker: WALKER, heartRate: 71, scale: 'unconfirmed' },
      true,
    );
    expect(gripped.body).toMatchObject({ heartRate: 110, kcal: 20 });
    runtime.ingest([frame('2acd', beltData(30, 0), 3)], SETTINGS);
    const released = liveFrameOf(
      { state, at, walker: WALKER, heartRate: 71, scale: 'unconfirmed' },
      true,
    );
    expect(released.body?.heartRate).toBe(71);
  });
});

describe('the supplement exercise record', () => {
  it('is not reported as an unreadable frame', () => {
    const { runtime } = walkingBelt();
    const result = runtime.ingest([frame(SUPPLEMENT, '73500900ffa4c66a000000002c', 0)], SETTINGS);
    expect(result.unreadable).toEqual([]);
  });

  it('keeps the model code of the system reply in the identity', () => {
    const { runtime } = walkingBelt();
    runtime.ingest(
      [frame(SUPPLEMENT, supplementHex(0x71, 0x81, [1, 0, 12, 0, 6, 0, 0, 0]), 0)],
      SETTINGS,
    );
    expect(runtime.identity).toMatchObject({ protocol: 1, modelCode: 12, capabilityWord: 6 });
  });
});
