import { describe, expect, it } from 'vitest';
import {
  ForbiddenFrameError,
  UnknownTreadmillFamilyError,
  UnsupportedCommandError,
  assertSendable,
  beltSteps,
  familyOf,
  faultOf,
  hexToBytes,
  isTreadmillAdvert,
  linkPlanParts,
  padSteps,
  FAULT_CODES,
  type ControlTarget,
} from '../../src';
import type { TreadmillGattDump } from '@smarteverything/domain';

const WILINK_DUMP: TreadmillGattDump = {
  name: 'KS-KFK15',
  services: [
    {
      uuid: 'fe00',
      characteristics: [
        { uuid: 'fe01', properties: ['notify'] },
        { uuid: 'fe02', properties: ['write_no_response'] },
      ],
    },
  ],
};

const FTMS_CHARACTERISTICS = [
  { uuid: '2acc', properties: ['read'] as const },
  { uuid: '2acd', properties: ['notify'] as const },
  { uuid: '2ad9', properties: ['write', 'indicate'] as const },
  { uuid: '2ada', properties: ['notify'] as const },
];

function ftmsDump(extra: TreadmillGattDump['services'] = [], odm = false): TreadmillGattDump {
  return {
    name: 'KS-HD-Z1D',
    services: [
      {
        uuid: '1826',
        characteristics: [
          ...FTMS_CHARACTERISTICS.map((entry) => ({
            uuid: entry.uuid,
            properties: [...entry.properties],
          })),
          ...(odm
            ? [{ uuid: 'd18d2c10-c44c-11e8-a355-529269fb1459', properties: ['write' as const] }]
            : []),
        ],
      },
      ...extra,
    ],
  };
}

const SUPPLEMENT_SERVICE_DUMP: TreadmillGattDump['services'] = [
  {
    uuid: '24e2521c-f63b-48ed-85be-c5330a00fdf7',
    characteristics: [
      { uuid: '24e2521c-f63b-48ed-85be-c5330b00fdf7', properties: ['notify'] },
      { uuid: '24e2521c-f63b-48ed-85be-c5330d00fdf7', properties: ['write_no_response'] },
    ],
  },
];

const NOW = new Date('2026-10-18T10:00:00.000Z');

describe('family detection', () => {
  it('decides from the GATT table and never from the name', () => {
    expect(familyOf(WILINK_DUMP)).toBe('wilink');
    expect(familyOf({ ...WILINK_DUMP, name: 'something else' })).toBe('wilink');
    expect(familyOf(ftmsDump())).toBe('ftms');
    expect(familyOf(ftmsDump([], true))).toBe('ftms_odm');
    expect(familyOf(ftmsDump(SUPPLEMENT_SERVICE_DUMP))).toBe('ftms_supplement');
  });

  it('prefers the standard service when both are present', () => {
    expect(
      familyOf({ ...ftmsDump(), services: [...ftmsDump().services, ...WILINK_DUMP.services] }),
    ).toBe('ftms');
  });

  it('refuses a device that is neither and says what it found', () => {
    expect(() =>
      familyOf({ name: 'Lamp', services: [{ uuid: '180f', characteristics: [] }] }),
    ).toThrow(UnknownTreadmillFamilyError);
    expect(() =>
      familyOf({
        name: 'Half',
        services: [{ uuid: 'fe00', characteristics: [{ uuid: 'fe01', properties: ['read'] }] }],
      }),
    ).toThrow('found fe00');
  });

  it('recognises a treadmill advert by its name prefix or service', () => {
    expect(isTreadmillAdvert('KS-KFK15', [])).toBe(true);
    expect(isTreadmillAdvert('WalkingPad', [])).toBe(true);
    expect(isTreadmillAdvert(null, ['fe00'])).toBe(true);
    expect(isTreadmillAdvert('Lamp', ['180f'])).toBe(false);
    expect(isTreadmillAdvert(null, [])).toBe(false);
  });
});

describe('link plans', () => {
  it('subscribes a WiLink belt to fe01 and asks for status only while it moves', () => {
    const plan = linkPlanParts('wilink', WILINK_DUMP, NOW);
    expect(plan.subscriptions).toStrictEqual([
      {
        service: 'fe00',
        characteristic: 'fe01',
        mode: 'notify',
        coalescePrefix: 'f8a2',
        changeByte: 2,
      },
    ]);
    expect(plan.control).toStrictEqual({
      service: 'fe00',
      characteristic: 'fe02',
      writeType: 'without_response',
    });
    expect(plan.statusRequest).toStrictEqual({
      hex: 'f7a20000a2fd',
      everyMs: 1000,
      stateByte: 2,
      activeValues: [1, 2, 6, 7, 8, 9],
      settleRequests: 5,
    });
    expect(plan.initial.map((step) => step.hex)).toStrictEqual([
      'f7a60000000000a6fd',
      'f7a20000a2fd',
    ]);
    expect(plan.preamble).toBeNull();
  });

  it('subscribes only to the FTMS characteristics the belt has', () => {
    const plan = linkPlanParts('ftms', ftmsDump(), NOW);
    expect(plan.subscriptions.map((entry) => entry.characteristic)).toStrictEqual([
      '2acd',
      '2ada',
      '2ad9',
    ]);
    expect(plan.subscriptions[0]?.coalescePrefix).toBe('');
    expect(plan.subscriptions[2]?.mode).toBe('indicate');
    expect(plan.control?.writeType).toBe('with_response');
    expect(plan.statusRequest).toBeNull();
    expect(plan.initial.map((step) => step.hex)).toStrictEqual(['00']);
  });

  it('puts the vendor pre-amble in front of every control write on the ODM family', () => {
    const plan = linkPlanParts('ftms_odm', ftmsDump([], true), NOW);
    expect(plan.preamble).toStrictEqual({
      characteristic: 'd18d2c10-c44c-11e8-a355-529269fb1459',
      hex: '01000d00060b0f0d',
    });
    expect(plan.writePacingMs).toBe(400);
  });

  it('unlocks the supplement family with a code derived from its name', () => {
    const plan = linkPlanParts('ftms_supplement', ftmsDump(SUPPLEMENT_SERVICE_DUMP), NOW);
    expect(plan.subscriptions.at(-1)?.characteristic).toBe('24e2521c-f63b-48ed-85be-c5330b00fdf7');
    expect(plan.initial[0]?.hex).toBe('710005012e5a314474');
    expect(plan.initial.at(-1)?.hex).toBe('00');
    expect(plan.initial.at(-1)?.characteristic).toBe('2ad9');
  });
});

const WILINK_TARGET: ControlTarget = {
  service: 'fe00',
  characteristic: 'fe02',
  writeType: 'without_response',
};

const FTMS_TARGET: ControlTarget = {
  service: '1826',
  characteristic: '2ad9',
  writeType: 'with_response',
};

describe('belt commands', () => {
  it('starts a WiLink belt in manual mode and waits for the pad before starting', () => {
    expect(beltSteps('wilink', WILINK_TARGET, { kind: 'start' })).toStrictEqual([
      { ...WILINK_TARGET, hex: 'f7a20201a5fd', pauseAfterMs: 1500 },
      { ...WILINK_TARGET, hex: 'f7a20401a7fd', pauseAfterMs: 0 },
    ]);
  });

  it('stops by speed zero, pauses, resumes and sets the speed on a WiLink belt', () => {
    const hexes = (kind: 'stop' | 'pause' | 'resume'): string[] =>
      beltSteps('wilink', WILINK_TARGET, { kind }).map((step) => step.hex);
    expect(hexes('stop')).toStrictEqual(['f7a20100a3fd']);
    expect(hexes('pause')).toStrictEqual(['f7a20501a8fd']);
    expect(hexes('resume')).toStrictEqual(['f7a20401a7fd']);
    expect(beltSteps('wilink', WILINK_TARGET, { kind: 'speed', kmh: 2 })[0]?.hex).toBe(
      'f7a20114b7fd',
    );
    expect(beltSteps('wilink', WILINK_TARGET, { kind: 'mode', mode: 'auto' })[0]?.hex).toBe(
      'f7a20200a4fd',
    );
  });

  it('refuses a mode only the panel can choose', () => {
    expect(() => beltSteps('wilink', WILINK_TARGET, { kind: 'mode', mode: 'hiit' })).toThrow(
      UnsupportedCommandError,
    );
    expect(() => beltSteps('ftms', FTMS_TARGET, { kind: 'mode', mode: 'auto' })).toThrow(
      'chosen on the panel',
    );
  });

  it('uses the Control Point opcodes on a standard belt', () => {
    const hexes = (kind: 'start' | 'stop' | 'pause' | 'resume'): string[] =>
      beltSteps('ftms', FTMS_TARGET, { kind }).map((step) => step.hex);
    expect(hexes('start')).toStrictEqual(['07']);
    expect(hexes('resume')).toStrictEqual(['07']);
    expect(hexes('stop')).toStrictEqual(['0801']);
    expect(hexes('pause')).toStrictEqual(['0802']);
    expect(beltSteps('ftms_odm', FTMS_TARGET, { kind: 'speed', kmh: 3 })[0]?.hex).toBe('022c01');
  });
});

describe('incline', () => {
  it('asks for control and then sets the target inclination on the standard families', () => {
    for (const family of ['ftms', 'ftms_supplement'] as const) {
      expect(
        beltSteps(family, FTMS_TARGET, { kind: 'incline', percent: 3 }).map((step) => step.hex),
      ).toStrictEqual(['00', '031e00']);
    }
  });

  it('refuses an incline on the other families', () => {
    for (const family of ['wilink', 'ftms_odm'] as const) {
      expect(() => beltSteps(family, FTMS_TARGET, { kind: 'incline', percent: 3 })).toThrow(
        UnsupportedCommandError,
      );
    }
  });
});

describe('pad settings', () => {
  it('writes the WiLink preferences', () => {
    const hex = (write: Parameters<typeof padSteps>[2]): string | undefined =>
      padSteps('wilink', WILINK_TARGET, write, 0)[0]?.hex;
    expect(hex({ key: 'max_speed', kmh: 6 })).toBe('f7a6030000003ce5fd');
    expect(hex({ key: 'start_speed', kmh: 1.5 })).toBe('f7a6040000000fb9fd');
    expect(hex({ key: 'child_lock', on: true })).toBe('f7a60900000001b0fd');
    expect(hex({ key: 'auto_start', on: true })).toBe('f7a60500000001acfd');
    expect(hex({ key: 'sensitivity', level: 'low' })).toBe('f7a60600000003affd');
    expect(hex({ key: 'goal', kind: 'distance', value: 3000 })).toBe('f7a60101000bb86bfd');
    expect(() => padSteps('wilink', WILINK_TARGET, { key: 'buzzer', on: true }, 0)).toThrow(
      'supplement family only',
    );
  });

  it('writes the supplement properties and keeps the switch bits it does not own', () => {
    const steps = padSteps(
      'ftms_supplement',
      FTMS_TARGET,
      { key: 'buzzer', on: true },
      0b1000_0000,
    );
    expect(steps[0]).toMatchObject({
      service: '24e2521c-f63b-48ed-85be-c5330a00fdf7',
      characteristic: '24e2521c-f63b-48ed-85be-c5330d00fdf7',
      writeType: 'without_response',
    });
    expect(steps[0]?.hex).toBe('72010308820000');
    const off = padSteps('ftms_supplement', FTMS_TARGET, { key: 'buzzer', on: false }, 0b1010);
    expect(off[0]?.hex.slice(6, 12)).toBe('080800');
    expect(
      padSteps('ftms_supplement', FTMS_TARGET, { key: 'child_lock', on: true }, 0)[0]?.hex,
    ).toBe('720103060100' + '7d');
    expect(
      padSteps('ftms_supplement', FTMS_TARGET, { key: 'max_speed', kmh: 6 }, 0)[0]?.hex.slice(
        6,
        12,
      ),
    ).toBe('075802');
    expect(() =>
      padSteps('ftms_supplement', FTMS_TARGET, { key: 'sensitivity', level: 'low' }, 0),
    ).toThrow('Expected child lock');
  });

  it('leaves the settings of a standard belt to its panel', () => {
    expect(() => padSteps('ftms', FTMS_TARGET, { key: 'child_lock', on: true }, 0)).toThrow(
      'changed on the panel',
    );
    expect(() =>
      padSteps('ftms_odm', FTMS_TARGET, { key: 'goal', kind: 'distance', value: 600 }, 0),
    ).toThrow('changed on the panel');
  });
});

describe('frames that are never sent', () => {
  it('refuses firmware, calibration, record pop, beep, profile, heart sync and lock frames', () => {
    for (const hex of [
      'e801',
      'f7a602000001',
      'f7a7aa0051fd',
      'f7a20307acfd',
      'f7a560fd',
      'f7a20664fd',
      'f7a20701fd',
    ]) {
      expect(() => {
        assertSendable(hexToBytes(hex));
      }).toThrow(ForbiddenFrameError);
    }
  });

  it('lets the documented frames through', () => {
    for (const hex of ['f7a20114b7fd', 'f7a6030000003ce5fd', '07', '0801', '7200010073']) {
      expect(() => {
        assertSendable(hexToBytes(hex));
      }).not.toThrow();
    }
  });
});

describe('fault codes', () => {
  it('explains the codes of the manual and carries the power-off tip', () => {
    expect(FAULT_CODES).toStrictEqual(['E01', 'E02', 'E03', 'E05', 'E06', 'E10', 'E13']);
    expect(faultOf('E02', 'wilink')).toMatchObject({ code: 'E02', cause: 'The motor stalled.' });
    expect(faultOf('E02', 'wilink').tip).toContain('ten minutes');
    expect(faultOf('E99', 'wilink').cause).toContain('does not know');
  });
});
