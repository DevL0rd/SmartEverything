import type { TreadmillGattDump } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { identityOf } from '../../src';

const KINGSMITH = '4b494e47534d495448';

function characteristic(
  uuid: string,
  value?: string,
): TreadmillGattDump['services'][number]['characteristics'][number] {
  return {
    uuid,
    properties: ['read'],
    ...(value === undefined ? {} : { value }),
  };
}

const FULL: TreadmillGattDump = {
  name: 'KS-K15',
  services: [
    {
      uuid: '180a',
      characteristics: [
        characteristic('2a29', KINGSMITH),
        characteristic('2a24', '4b3135'),
        characteristic('2a26', '312e322e3300'),
        characteristic('2a25', '20'),
      ],
    },
    {
      uuid: '1826',
      characteristics: [
        characteristic('2acc', '4600000001000000'),
        characteristic('2ad4', '5000dc050a00'),
        characteristic('2ad5', '000028000a00'),
      ],
    },
  ],
};

describe('what a treadmill tells about itself', () => {
  it('reads the device information as trimmed text and leaves out what is empty', () => {
    expect(identityOf(FULL)).toMatchObject({
      manufacturer: 'KINGSMITH',
      model: 'K15',
      firmware: '1.2.3',
      serial: null,
      software: null,
      hardware: null,
    });
  });

  it('reads the speed range, the incline range and the feature words of the fitness machine', () => {
    const identity = identityOf(FULL);
    expect(identity.speedMinKmh).toBeCloseTo(0.8);
    expect(identity.speedMaxKmh).toBeCloseTo(15);
    expect(identity.speedStepKmh).toBeCloseTo(0.1);
    expect(identity.inclineMinPercent).toBe(0);
    expect(identity.inclineMaxPercent).toBeCloseTo(4);
    expect(identity.features).toEqual(['cadence', 'total_distance', 'step_count']);
    expect(identity.targets).toEqual(['speed']);
  });

  it('knows nothing it was not told about a belt with only the WiLink service', () => {
    const identity = identityOf({
      name: 'KS-K15',
      services: [
        {
          uuid: 'fe00',
          characteristics: [
            { uuid: 'fe01', properties: ['notify'] },
            { uuid: 'fe02', properties: ['write'] },
          ],
        },
      ],
    });
    expect(identity).toMatchObject({
      manufacturer: null,
      model: null,
      speedMinKmh: null,
      speedMaxKmh: null,
      inclineMaxPercent: null,
      features: [],
      targets: [],
      motorVersion: null,
      protocol: null,
    });
  });
});
