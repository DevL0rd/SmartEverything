import { describe, expect, it } from 'vitest';
import {
  SCALE_MEASUREMENT_OBJECT,
  ScalePacketError,
  decryptObjects,
  decodeScaleObject,
  hexToBytes,
  isXiaomiScale,
  parseMiBeacon,
  type MiBeaconObject,
} from '../src';
import {
  BIND_KEY_HEX,
  SCALE_ADDRESS,
  SCALE_MEASUREMENT_FRAME,
  SCALE_STEPPED_OFF_FRAME,
} from './frames';

function objectOf(frameHex: string): MiBeaconObject {
  const [object] = decryptObjects(parseMiBeacon(hexToBytes(frameHex)), {
    mac: SCALE_ADDRESS,
    bindKey: BIND_KEY_HEX,
  });
  if (object === undefined) {
    throw new Error('the fixture frame carries no object');
  }
  return object;
}

function packed(weight: number, heart: number, impedance: number): MiBeaconObject {
  const word = (weight | (heart << 11) | (impedance << 18)) >>> 0;
  const data = new Uint8Array(9);
  new DataView(data.buffer).setUint32(1, word, true);
  new DataView(data.buffer).setUint32(5, 1_760_000_000, true);
  data[0] = 3;
  return { id: SCALE_MEASUREMENT_OBJECT, data };
}

describe('Xiaomi body scale', () => {
  it('knows the scale products by their MiBeacon product id', () => {
    for (const product of [0x30d9, 0x3bd5, 0x48cf, 0x4b05, 0x78bd]) {
      expect(isXiaomiScale(product)).toBe(true);
    }
    expect(isXiaomiScale(0x098b)).toBe(false);
    expect(isXiaomiScale(0)).toBe(false);
  });

  it('reads weight, heart rate and impedance from a measurement frame', () => {
    expect(objectOf(SCALE_MEASUREMENT_FRAME).id).toBe(SCALE_MEASUREMENT_OBJECT);
    expect(decodeScaleObject(objectOf(SCALE_MEASUREMENT_FRAME))).toStrictEqual({
      kind: 'measurement',
      scaleUser: 1,
      measuredAt: 1_760_000_000,
      weightKg: 70.5,
      heartRate: 72,
      impedance: 500,
    });
  });

  it('reads a frame sent when the person stepped off', () => {
    expect(decodeScaleObject(objectOf(SCALE_STEPPED_OFF_FRAME))).toStrictEqual({
      kind: 'stepped_off',
      scaleUser: 2,
    });
  });

  it('leaves out a reading the scale did not take', () => {
    expect(decodeScaleObject(packed(705, 0, 0))).toMatchObject({
      kind: 'measurement',
      weightKg: 70.5,
      heartRate: null,
      impedance: null,
    });
    expect(decodeScaleObject(packed(0, 22, 0))).toMatchObject({
      kind: 'measurement',
      weightKg: null,
      heartRate: 72,
      impedance: null,
    });
    expect(decodeScaleObject(packed(0, 0, 5000))).toMatchObject({
      kind: 'measurement',
      weightKg: null,
      heartRate: null,
      impedance: 500,
    });
  });

  it('reads the heart rate offset by fifty and treats 127 as no heart rate', () => {
    expect(decodeScaleObject(packed(705, 1, 0))).toMatchObject({ heartRate: 51 });
    expect(decodeScaleObject(packed(705, 126, 0))).toMatchObject({ heartRate: 176 });
    expect(decodeScaleObject(packed(705, 127, 0))).toMatchObject({ heartRate: null });
  });

  it('keeps the largest weight and impedance the packed word holds', () => {
    expect(decodeScaleObject(packed(0x7ff, 0, 0x3fff))).toMatchObject({
      weightKg: 204.7,
      impedance: 1638.3,
    });
  });

  it('names its packet error', () => {
    expect(new ScalePacketError('x').name).toBe('ScalePacketError');
  });

  it('refuses an object that is not a scale measurement of nine bytes', () => {
    expect(() => decodeScaleObject({ id: 0x1019, data: new Uint8Array(9) })).toThrow(
      new ScalePacketError('Expected object 0x6e16 of 9 bytes, received 0x1019 of 9.'),
    );
    expect(() =>
      decodeScaleObject({ id: SCALE_MEASUREMENT_OBJECT, data: new Uint8Array(8) }),
    ).toThrow(new ScalePacketError('Expected object 0x6e16 of 9 bytes, received 0x6e16 of 8.'));
    expect(() =>
      decodeScaleObject({ id: SCALE_MEASUREMENT_OBJECT, data: new Uint8Array(10) }),
    ).toThrow(ScalePacketError);
  });
});
