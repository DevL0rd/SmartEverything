import { describe, expect, it } from 'vitest';
import {
  SonicareFrameError,
  decodeClassic,
  decodeSensorFrame,
  hexToBytes,
  settingFlags,
  withSetting,
  type BrushDelta,
} from '../../src';
import { readValues } from './fixtures';

function merged(name: string): BrushDelta {
  return readValues(name).reduce<BrushDelta>(
    (all, value) => ({ ...all, ...decodeClassic(value.uuid, value.bytes) }),
    {},
  );
}

describe('a recorded DiamondClean HX992X', () => {
  const brush = merged('fx_classic_hx992x');

  it('reads who it is', () => {
    expect(brush).toMatchObject({
      model: 'HX992X',
      manufacturer: 'Philips OHC',
      firmware: '2.15.1 0.6.1.0',
      pnp: '01000007000000',
    });
  });

  it('reads what it is doing', () => {
    expect(brush).toMatchObject({
      battery: 0x20,
      handleState: 'run',
      brushingState: 'on',
      modePosition: 1,
      intensity: 1,
      elapsedS: 7,
      routineS: 160,
      sessionId: 485,
      routineIds: [0, 1, 2, 4],
      availableRoutines: 0x000f,
    });
  });

  it('reads the stored session counters and the motor', () => {
    expect(brush).toMatchObject({ latestStoredId: 484, storedCount: 485, motorSeconds: 44444 });
    expect(brush.handleClock).toBe(0x6a4fd034);
  });

  it('reads the brush head', () => {
    expect(brush).toMatchObject({
      headSerial: '04:09:1C:72:B8:1B:91',
      headType: 'sensitive',
      headLimitS: 21600,
      headUsageS: 5737,
      headMade: '241211 72M',
      nfcVersion: '2.1',
      headRing: 20,
      nfcUrl: 'https://www.philips.com/nfcbrushheadtap',
    });
  });

  it('reads the error bits, the voltage and the settings', () => {
    expect(brush).toMatchObject({
      errorPersistent: 0x1000,
      errorVolatile: 0,
      batteryMillivolts: 3645,
      settingsBits: 1,
    });
    expect(brush.calibrationWords).toHaveLength(10);
    expect(brush.calibrationWords?.[0]).toBe(1941);
  });
});

describe('a recorded Prestige HX999X', () => {
  const brush = merged('fx_classic_hx999x_prestige');

  it('reads the selected routine as an id and the calibration text', () => {
    expect(brush).toMatchObject({
      modeRoutineId: 0,
      routineIds: [0],
      modePosition: 0,
      intensity: 0,
    });
    expect(brush.calibration).toStrictEqual([
      'STrig 523',
      'PTrig 362',
      'SPP 360',
      'PSP 100',
      'SBase 344',
      'PBase 89',
      'CalSts 0x3',
      'SCalRslt 0x3',
      'PCalRslt 0x3',
      'SDevID 0x39',
      'PDevID 0x39',
    ]);
  });

  it('reads the persistent and volatile error bits', () => {
    expect(brush.errorPersistent).toBe(0x40002024);
    expect(brush.errorVolatile).toBe(0x40000004);
    expect(brush.settingsBits).toBe(0x1a00);
  });
});

describe('a recorded Kids HX6340', () => {
  const brush = merged('fx_classic_hx6340_kids');

  it('reads the reduced set it has', () => {
    expect(brush).toMatchObject({
      model: 'HX6340',
      battery: 0x18,
      handleState: 'run',
      modePosition: 0,
      elapsedS: 3,
      routineS: 120,
      easyStart: 0x0e,
      latestStoredId: 286,
    });
    expect(brush.headSerial).toBeUndefined();
  });
});

describe('frames that are not readable', () => {
  it('names the characteristic, what it expected and what arrived', () => {
    expect(() => decodeClassic('477ea600-a260-11e4-ae37-0002a5d54090', hexToBytes('07'))).toThrow(
      SonicareFrameError,
    );
    expect(() => decodeClassic('4090', hexToBytes(''))).toThrow(/at least 2 bytes/);
    expect(() => decodeClassic('2a19', hexToBytes(''))).toThrow(/2a19/);
  });

  it('ignores characteristics it does not decode', () => {
    expect(decodeClassic('4250', hexToBytes('01'))).toStrictEqual({});
    expect(decodeClassic('a6510002', hexToBytes('0102'))).toStrictEqual({});
  });

  it('treats an all zero head serial as no head and an unknown state as unknown', () => {
    expect(decodeClassic('4230', hexToBytes('00000000000000'))).toStrictEqual({ headSerial: null });
    expect(decodeClassic('4010', hexToBytes('05'))).toStrictEqual({ handleState: null });
    expect(decodeClassic('4082', hexToBytes('09'))).toStrictEqual({ brushingState: null });
  });

  it('reads the modes of a two byte position and pads a short settings word', () => {
    expect(decodeClassic('4080', hexToBytes('0200'))).toStrictEqual({ modePosition: 2 });
    expect(decodeClassic('4420', hexToBytes('0002'))).toStrictEqual({ settingsBits: 0x0200 });
  });

  it('reads a transfer header and a record chunk and status', () => {
    expect(decodeClassic('40e0', hexToBytes('4f010f0000005caa'))).toStrictEqual({
      transfer: { sessionId: 335, length: 15 },
    });
    expect(decodeClassic('4100', hexToBytes('00aabb')).recordChunk).toStrictEqual(
      hexToBytes('00aabb'),
    );
    expect(decodeClassic('4110', hexToBytes('01'))).toStrictEqual({ recordStatus: 1 });
    expect(() => decodeClassic('40e0', hexToBytes('4f01'))).toThrow(SonicareFrameError);
  });
});

describe('the sensor stream', () => {
  it('reads a pressure value and its state', () => {
    expect(decodeSensorFrame(hexToBytes('01000100d20002'))).toStrictEqual({
      pressureValue: 210,
      pressure: 'too_high',
    });
    expect(decodeSensorFrame(hexToBytes('01000100ffff01'))).toStrictEqual({
      pressureValue: -1,
      pressure: 'optimal',
    });
  });

  it('reads the five byte state frame of a handle that sends no value', () => {
    expect(decodeSensorFrame(hexToBytes('0100010002'))).toStrictEqual({ pressure: 'too_high' });
    expect(decodeSensorFrame(hexToBytes('0100010001'))).toStrictEqual({ pressure: 'optimal' });
    expect(decodeSensorFrame(hexToBytes('0100010000'))).toStrictEqual({ pressure: 'no_contact' });
  });

  it('ignores counter frames and states it does not know', () => {
    expect(decodeSensorFrame(hexToBytes('01000100'))).toStrictEqual({});
    expect(decodeSensorFrame(hexToBytes('0100010007'))).toStrictEqual({});
    expect(decodeSensorFrame(hexToBytes('01000100050007'))).toStrictEqual({ pressureValue: 5 });
  });

  it('reads whole degrees and marks the motion stream without decoding it', () => {
    expect(decodeSensorFrame(hexToBytes('02000100001a'))).toStrictEqual({ temperatureC: 26 });
    expect(decodeSensorFrame(hexToBytes('0200010000f6'))).toStrictEqual({ temperatureC: -10 });
    expect(decodeSensorFrame(hexToBytes('0200010000'))).toStrictEqual({});
    expect(decodeSensorFrame(hexToBytes('040001000102030405060708090a0b0c'))).toStrictEqual({
      sensorFrame: 'imu',
    });
    expect(decodeSensorFrame(hexToBytes('0900'))).toStrictEqual({});
    expect(decodeSensorFrame(hexToBytes('01'))).toStrictEqual({});
  });
});

describe('the settings word', () => {
  it('names the three switches', () => {
    expect(settingFlags(0x1a00)).toStrictEqual({ pressure: true, scrubbing: true, adaptive: true });
    expect(settingFlags(0)).toStrictEqual({ pressure: false, scrubbing: false, adaptive: false });
  });

  it('changes one switch and leaves the other bits alone', () => {
    expect(withSetting(0x1001, 'pressure', true)).toBe(0x1201);
    expect(withSetting(0x1a01, 'scrubbing', false)).toBe(0x1201);
    expect(withSetting(0x0001, 'adaptive', false)).toBe(0x0001);
  });
});
