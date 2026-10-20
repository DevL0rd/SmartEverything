import { describe, expect, it } from 'vitest';
import {
  LarqResponseError,
  decodeAccelerometer,
  decodeAdcProtection,
  decodeAmbientLight,
  decodeCalibrationSettings,
  decodeCapacitive,
  decodeHall,
  decodeLogPage,
  decodeQuiet,
  decodeStateThresholds,
  decodeTimeSettings,
  decodeUvConfig,
} from '../../src';
import {
  codedFrame,
  concatBytes,
  emptySuccess,
  encodeFixed32,
  encodeFloat,
  encodeMessage,
  encodeVarint,
  nested,
  responseFrame,
} from './frames';

describe('LARQ settings and sensor responses', () => {
  it('reads the cap clock', () => {
    const frame = responseFrame(
      1,
      'RequestGetCapTimeSettings',
      nested(encodeVarint(1, 1_790_000_000_000)),
    );
    expect(decodeTimeSettings(frame)).toStrictEqual({ epochMilliseconds: 1_790_000_000_000 });
  });

  it('reads a tilt in g from the accelerometer', () => {
    const frame = responseFrame(
      2,
      'RequestGetCapAccelerometerState',
      nested(encodeFloat(1, 0.25), encodeFloat(2, -0.5), encodeFloat(3, 1)),
    );
    expect(decodeAccelerometer(frame)).toStrictEqual({ x: 0.25, y: -0.5, z: 1 });
  });

  it('reads the ambient light and the lid magnet', () => {
    expect(
      decodeAmbientLight(
        responseFrame(3, 'RequestGetCapAmbientLightSensorState', nested(encodeFloat(1, 120.5))),
      ),
    ).toStrictEqual({ lux: 120.5 });
    expect(
      decodeHall(
        responseFrame(
          4,
          'RequestGetCapHallEffectSensorState',
          nested(encodeVarint(1, 1_790_000_000), encodeVarint(2, 1)),
        ),
      ),
    ).toStrictEqual({ timestamp: 1_790_000_000, closed: true });
  });

  it('reads the two capacitive sensors with their signed values', () => {
    const sip = responseFrame(
      5,
      'RequestGetCapSipSensorState',
      nested(encodeVarint(1, 3), encodeVarint(2, 1)),
    );
    expect(decodeCapacitive(sip, 'RequestGetCapSipSensorState')).toStrictEqual({
      value: -2,
      active: true,
    });
    const bottle = responseFrame(6, 'RequestGetCapBottleSensorState', nested(encodeVarint(1, 8)));
    expect(decodeCapacitive(bottle, 'RequestGetCapBottleSensorState')).toStrictEqual({
      value: 4,
      active: false,
    });
  });

  it('reads quiet hours whether the cap sends times as 32-bit or varint numbers', () => {
    const fixed = responseFrame(
      7,
      'RequestGetCapDoNotDisturbSettings',
      nested(
        encodeVarint(1, 2),
        encodeFixed32(2, 82_800),
        encodeFixed32(3, 25_200),
        encodeFixed32(4, 30),
      ),
    );
    const varint = responseFrame(
      7,
      'RequestGetCapDoNotDisturbSettings',
      nested(
        encodeVarint(1, 2),
        encodeVarint(2, 82_800),
        encodeVarint(3, 25_200),
        encodeVarint(4, 30),
      ),
    );
    const expected = {
      state: 'auto',
      startSeconds: 82_800,
      stopSeconds: 25_200,
      snoozeMinutes: 30,
    };
    expect(decodeQuiet(fixed)).toStrictEqual(expected);
    expect(decodeQuiet(varint)).toStrictEqual(expected);
  });

  it('keeps an enum value it does not know instead of failing', () => {
    const frame = responseFrame(
      8,
      'RequestGetCapDoNotDisturbSettings',
      nested(encodeVarint(1, 7), encodeFixed32(2, 1), encodeFixed32(3, 2)),
    );
    expect(decodeQuiet(frame).state).toBe('unknown_7');
  });

  it('reads the UV parameters of the three modes', () => {
    const parameters = (cycle: number, current: number): Uint8Array =>
      concatBytes(encodeVarint(1, cycle), encodeVarint(2, current));
    const frame = responseFrame(
      9,
      'RequestGetCapUvConfig',
      nested(
        encodeMessage(1, parameters(10, 100)),
        encodeMessage(2, parameters(60, 120)),
        encodeMessage(3, parameters(180, 150)),
      ),
    );
    expect(decodeUvConfig(frame)).toStrictEqual({
      maintenance: { cycle: 10, currentMa: 100 },
      normal: { cycle: 60, currentMa: 120 },
      adventure: { cycle: 180, currentMa: 150 },
    });
  });

  it('reads the state thresholds', () => {
    const frame = responseFrame(
      10,
      'RequestGetCapStateThresholdSettings',
      nested(
        encodeFixed32(1, 11),
        encodeFixed32(2, 12),
        encodeFixed32(3, 13),
        encodeFixed32(4, 14),
        encodeFixed32(5, 15),
        encodeFloat(6, 0.5),
      ),
    );
    expect(decodeStateThresholds(frame)).toStrictEqual({
      bottleSensorDelta: 11,
      sipSensorDelta: 12,
      ambientUvStartLux: 13,
      ambientUvOnLux: 14,
      ambientTofLux: 15,
      accelerometerOffset: 0.5,
    });
  });

  it('reads the protection limits of the battery and the UV LED', () => {
    const limits = (over: number, open: number, short: number): Uint8Array =>
      concatBytes(encodeFloat(1, over), encodeFloat(2, open), encodeFloat(3, short));
    const frame = responseFrame(
      11,
      'RequestGetCapAdcProtectionSettings',
      nested(encodeMessage(1, limits(1000, 4.5, 0.5)), encodeMessage(2, limits(2000, 6, 1))),
    );
    expect(decodeAdcProtection(frame)).toStrictEqual({
      battery: { overtempOhm: 1000, openVolt: 4.5, shortVolt: 0.5 },
      uvLed: { overtempOhm: 2000, openVolt: 6, shortVolt: 1 },
    });
  });

  it('reads the calibration timeout', () => {
    const frame = responseFrame(
      12,
      'RequestGetCapCalibrationSettings',
      nested(encodeFixed32(1, 120)),
    );
    expect(decodeCalibrationSettings(frame)).toStrictEqual({ timeoutSeconds: 120 });
  });
});

describe('LARQ log pages', () => {
  it('reads state log rows with their four flags and three raw values', () => {
    const row = concatBytes(
      encodeVarint(1, 1_790_000_000),
      encodeVarint(2, 1),
      encodeVarint(4, 1),
      encodeFloat(6, 1.5),
      encodeFloat(7, 20),
      encodeFloat(8, -2),
    );
    const frame = responseFrame(13, 'RequestGetCapStateLog', encodeMessage(1, row));
    expect(decodeLogPage(frame, 'state')).toStrictEqual([
      {
        at: 1_790_000_000,
        hall: true,
        bottle: false,
        ambient: true,
        sip: false,
        bottleValue: 1.5,
        ambientValue: 20,
        sipValue: -2,
      },
    ]);
  });

  it('reads fault rows by name and keeps a fault it does not know', () => {
    const rows = concatBytes(
      encodeMessage(1, concatBytes(encodeVarint(1, 100), encodeVarint(2, 2))),
      encodeMessage(1, concatBytes(encodeVarint(1, 200), encodeVarint(2, 9))),
    );
    const frame = responseFrame(14, 'RequestGetCapFaultLog', rows);
    expect(decodeLogPage(frame, 'fault')).toStrictEqual([
      { at: 100, type: 'uv_led_open' },
      { at: 200, type: 'unknown_9' },
    ]);
  });

  it('reads the electrical rows of a UV cycle and of a charge', () => {
    const row = concatBytes(
      encodeVarint(1, 300),
      encodeFloat(2, 4.1),
      encodeFloat(3, 10000),
      encodeFloat(4, 5.5),
      encodeFloat(5, 120),
      encodeFloat(6, 9000),
      encodeFloat(7, 8000),
    );
    const expected = {
      at: 300,
      batteryVolt: Math.fround(4.1),
      batteryOhm: 10_000,
      uvLedVolt: 5.5,
      uvLedMa: 120,
      uvLedOhm: 9000,
      pcbOhm: 8000,
    };
    const activation = responseFrame(
      15,
      'RequestGetActivationCapAdcLog',
      concatBytes(encodeMessage(1, row)),
    );
    const charging = responseFrame(
      16,
      'RequestGetChargingCapAdcLog',
      concatBytes(encodeMessage(1, row)),
    );
    expect(decodeLogPage(activation, 'activation_adc')).toStrictEqual([expected]);
    expect(decodeLogPage(charging, 'charging_adc')).toStrictEqual([expected]);
  });

  it('treats a success with no body as the end of history', () => {
    expect(decodeLogPage(emptySuccess(17), 'tof')).toStrictEqual([]);
  });

  it('refuses a log page the cap did not answer', () => {
    expect(() => decodeLogPage(codedFrame(18, 0), 'tof')).toThrow(LarqResponseError);
    expect(() => decodeLogPage(codedFrame(18, 2), 'fault')).toThrow(LarqResponseError);
  });
});
