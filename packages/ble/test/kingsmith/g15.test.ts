import type { TreadmillGattDump } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  decodeSupplement,
  faultOf,
  hexToBytes,
  identityOf,
  padSteps,
  parseFeatures,
  parseMachineStatus,
  parseTreadmillData,
  targetInclination,
  type ControlTarget,
} from '../../src';
import { propertyWriteFrame, SWITCH_BITS } from '../../src/kingsmith/vendor';

function characteristic(
  uuid: string,
  value: string,
): TreadmillGattDump['services'][number]['characteristics'][number] {
  return { uuid, properties: ['read'], value };
}

const G15: TreadmillGattDump = {
  name: 'KS-SO-G15',
  services: [
    {
      uuid: '180a',
      characteristics: [characteristic('2a24', '4b532d473135')],
    },
    {
      uuid: '1826',
      characteristics: [
        characteristic('2acc', '4816000044020000'),
        characteristic('2ad4', '6400dc050a00'),
        characteristic('2ad5', '0000c8000a00'),
      ],
    },
  ],
};

describe('the supplement exercise record of the G15', () => {
  it('accepts the record the belt sent although it does not follow the Z1 checksum', () => {
    expect(decodeSupplement(hexToBytes('73500900ffa4c66a000000002c'))).toStrictEqual({
      kind: 'exercise_record',
      hex: '00ffa4c66a00000000',
    });
  });

  it('still refuses a record of the wrong length and a wrong checksum on every other frame', () => {
    expect(() => decodeSupplement(hexToBytes('73500900ffa4c66a2c'))).toThrow(
      'wrong length or checksum',
    );
    expect(() => decodeSupplement(hexToBytes('7351010000'))).toThrow('wrong length or checksum');
  });
});

describe('what the G15 tells about its incline', () => {
  it('keeps the incline step of the supported range', () => {
    const identity = identityOf(G15);
    expect(identity.inclineMinPercent).toBe(0);
    expect(identity.inclineMaxPercent).toBeCloseTo(20);
    expect(identity.inclineStepPercent).toBeCloseTo(1);
    expect(identity.speedMinKmh).toBeCloseTo(1);
    expect(identity.features).toContain('inclination');
    expect(identity.modelCode).toBeNull();
  });

  it('does not trust a target word that only copies the machine word', () => {
    const mirrored: TreadmillGattDump = {
      name: 'KS-SO-G15',
      services: [
        {
          uuid: '1826',
          characteristics: [characteristic('2acc', '4816000048160000')],
        },
      ],
    };
    expect(parseFeatures(hexToBytes('4816000048160000')).targetsMirrorMachine).toBe(true);
    expect(identityOf(mirrored).targets).toEqual([]);
    expect(identityOf(G15).targets).toEqual(['resistance', 'steps', 'time']);
  });

  it('reads the target inclination status and encodes the target inclination command', () => {
    expect(parseMachineStatus(hexToBytes('060a00'))).toStrictEqual({
      kind: 'target_incline',
      percent: 1,
    });
    expect(() => parseMachineStatus(hexToBytes('0605'))).toThrow('16-bit inclination');
    expect(targetInclination(1).toHex()).toBe('030a00');
    expect(targetInclination(20).toHex()).toBe('03c800');
    expect(targetInclination(-1.5).toHex()).toBe('03f1ff');
  });
});

describe('the heart rate from the grips', () => {
  it('reports a zero when the hands leave the grips so an old rate does not stay', () => {
    expect(parseTreadmillData(hexToBytes('000164000000')).heartRate).toBe(0);
    expect(parseTreadmillData(hexToBytes('0001640078')).heartRate).toBe(120);
  });
});

describe('what a G15 shares with a K15', () => {
  const target: ControlTarget = {
    service: '24e2521c-f63b-48ed-85be-c5330a00fdf7',
    characteristic: '24e2521c-f63b-48ed-85be-c5330d00fdf7',
    writeType: 'without_response',
  };

  it('does not describe a code with the K15 manual unless the belt is a WiLink one', () => {
    expect(faultOf('E02', 'wilink').cause).toBe('The motor stalled.');
    expect(faultOf('E02', 'ftms_supplement').cause).toContain('does not know');
    expect(faultOf('E02', 'ftms').cause).toContain('does not know');
    expect(faultOf('E02', 'ftms_supplement', 'KS-G15').cause).toContain('Unknown G15 fault code');
    expect(faultOf('E02', 'wilink', 'KS-G15').cause).toBe('The motor stalled.');
  });

  it('switches the light strip with bit 3 of the switch property and keeps the other bits', () => {
    const steps = padSteps('ftms_supplement', target, { key: 'light', on: true }, 0b0010);
    expect(steps[0]?.hex).toBe(propertyWriteFrame(8, 0b1010).toHex());
    const off = padSteps('ftms_supplement', target, { key: 'light', on: false }, 0b1010);
    expect(off[0]?.hex).toBe(propertyWriteFrame(8, 0b0010).toHex());
    expect(SWITCH_BITS.light).toBe(8);
    expect(() => padSteps('wilink', target, { key: 'light', on: true }, 0)).toThrow(
      'supplement family only',
    );
  });
});
