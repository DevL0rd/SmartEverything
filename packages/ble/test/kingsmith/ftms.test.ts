import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FtmsFrameError,
  hexToBytes,
  parseControlResponse,
  parseFeatures,
  parseInclineRange,
  parseMachineStatus,
  parseSpeedRange,
  parseTrainingStatus,
  parseTreadmillData,
} from '../../src';
import {
  pauseMachine,
  requestControl,
  resetMachine,
  startOrResume,
  stopMachine,
  targetSpeed,
} from '../../src/kingsmith/ftms';

const Z1_FRAME = '04242c01d204005802dc0500';

function flagsHex(flags: number): string {
  return (flags & 0xff).toString(16).padStart(2, '0') + (flags >> 8).toString(16).padStart(2, '0');
}

describe('FTMS Treadmill Data', () => {
  it('reads the frame a Z1 sends: speed, distance, elapsed time and the Kingsmith steps', () => {
    expect(parseTreadmillData(hexToBytes(Z1_FRAME))).toStrictEqual({
      speedKmh: 3,
      distanceM: 1234,
      timeS: 600,
      steps: 1500,
    });
  });

  it('reads every optional field in the order the specification gives', () => {
    const hex =
      flagsHex(0x3ffe) +
      '0a00' +
      '1400' +
      '0a0000' +
      '14000000' +
      '0a000000' +
      '05' +
      '06' +
      '6400c80005' +
      '78' +
      '2a' +
      '3c00' +
      '5000' +
      '00000000' +
      'e803';
    expect(parseTreadmillData(hexToBytes(hex))).toStrictEqual({
      speedKmh: 0.1,
      averageSpeedKmh: 0.2,
      distanceM: 10,
      inclinePercent: 2,
      elevationGainM: 1,
      energyKcal: 100,
      energyKcalPerHour: 200,
      energyKcalPerMinute: 5,
      heartRate: 120,
      met: 4.2,
      timeS: 60,
      remainingS: 80,
      steps: 1000,
    });
  });

  it('has no speed when the more-data bit is set', () => {
    expect(parseTreadmillData(hexToBytes(flagsHex(0x0401) + '3c00'))).toStrictEqual({ timeS: 60 });
  });

  it('leaves out values the machine marks as not available', () => {
    const hex = flagsHex(0x0088) + '0a00' + 'ff7f0000' + 'ffffffffff';
    expect(parseTreadmillData(hexToBytes(hex))).toStrictEqual({ speedKmh: 0.1 });
  });

  it('reports a zero heart rate as zero and leaves out a zero metabolic equivalent', () => {
    const hex = flagsHex(0x0300) + '0a00' + '00' + '00';
    expect(parseTreadmillData(hexToBytes(hex))).toStrictEqual({ speedKmh: 0.1, heartRate: 0 });
  });

  it('names the field a frame ended before', () => {
    expect(() => parseTreadmillData(hexToBytes('0400'))).toThrow(
      new FtmsFrameError(
        'The Treadmill Data frame ended before the instantaneous speed field: needed 4 bytes, received 2.',
      ),
    );
    expect(() => parseTreadmillData(hexToBytes('0424' + '2c01'))).toThrow('total distance');
    expect(() => parseTreadmillData(hexToBytes('00'))).toThrow('flags');
  });

  it('never throws on a frame whose fields it can all read', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 2, maxLength: 40 }), (bytes) => {
        try {
          parseTreadmillData(bytes);
        } catch (cause) {
          expect(cause).toBeInstanceOf(FtmsFrameError);
        }
      }),
    );
  });
});

describe('FTMS characteristics', () => {
  it('lists the machine and target features a Feature word carries', () => {
    const features = parseFeatures(hexToBytes('4a10000021020000'));
    expect(features.machine).toStrictEqual([
      'cadence',
      'inclination',
      'step_count',
      'elapsed_time',
    ]);
    expect(features.targets).toStrictEqual(['speed', 'energy', 'time']);
    expect(() => parseFeatures(hexToBytes('4a24'))).toThrow(FtmsFrameError);
  });

  it('reads the supported speed range in kilometres per hour', () => {
    expect(parseSpeedRange(hexToBytes('5000dc050a00'))).toStrictEqual({
      min: 0.8,
      max: 15,
      step: 0.1,
    });
    expect(() => parseSpeedRange(hexToBytes('5000'))).toThrow(FtmsFrameError);
  });

  it('reads the supported inclination range in percent', () => {
    expect(parseInclineRange(hexToBytes('0000280005' + '00'))).toStrictEqual({
      min: 0,
      max: 4,
      step: 0.5,
    });
    expect(() => parseInclineRange(hexToBytes('00'))).toThrow(FtmsFrameError);
  });

  it('names the training status', () => {
    expect(parseTrainingStatus(hexToBytes('000d'))).toBe('manual');
    expect(() => parseTrainingStatus(hexToBytes('0020'))).toThrow(FtmsFrameError);
    expect(() => parseTrainingStatus(hexToBytes('00'))).toThrow(FtmsFrameError);
  });
});

describe('FTMS machine status and control responses', () => {
  it('maps every status opcode the specification defines', () => {
    expect(parseMachineStatus(hexToBytes('01'))).toStrictEqual({ kind: 'reset' });
    expect(parseMachineStatus(hexToBytes('0201'))).toStrictEqual({ kind: 'stopped' });
    expect(parseMachineStatus(hexToBytes('0202'))).toStrictEqual({ kind: 'paused' });
    expect(parseMachineStatus(hexToBytes('03'))).toStrictEqual({ kind: 'safety_stop' });
    expect(parseMachineStatus(hexToBytes('04'))).toStrictEqual({ kind: 'started' });
    expect(parseMachineStatus(hexToBytes('052c01'))).toStrictEqual({
      kind: 'target_speed',
      kmh: 3,
    });
    expect(parseMachineStatus(hexToBytes('ff'))).toStrictEqual({ kind: 'control_lost' });
    expect(parseMachineStatus(hexToBytes('0a1000'))).toStrictEqual({ kind: 'other', opcode: 10 });
    expect(() => parseMachineStatus(new Uint8Array(0))).toThrow(FtmsFrameError);
    expect(() => parseMachineStatus(hexToBytes('052c'))).toThrow(FtmsFrameError);
  });

  it('reads control point responses', () => {
    expect(parseControlResponse(hexToBytes('800701'))).toStrictEqual({
      opcode: 7,
      result: 'success',
    });
    expect(parseControlResponse(hexToBytes('800004'))).toStrictEqual({
      opcode: 0,
      result: 'failed',
    });
    for (const [code, result] of [
      ['02', 'not_supported'],
      ['03', 'invalid_parameter'],
      ['05', 'not_permitted'],
    ] as const) {
      expect(parseControlResponse(hexToBytes(`8008${code}`)).result).toBe(result);
    }
    expect(() => parseControlResponse(hexToBytes('700701'))).toThrow(FtmsFrameError);
    expect(() => parseControlResponse(hexToBytes('800709'))).toThrow(FtmsFrameError);
    expect(() => parseControlResponse(hexToBytes('8007'))).toThrow(FtmsFrameError);
  });
});

describe('FTMS control point commands', () => {
  it('encodes the opcodes of the specification', () => {
    expect(requestControl().toHex()).toBe('00');
    expect(resetMachine().toHex()).toBe('01');
    expect(startOrResume().toHex()).toBe('07');
    expect(stopMachine().toHex()).toBe('0801');
    expect(pauseMachine().toHex()).toBe('0802');
    expect(targetSpeed(3).toHex()).toBe('022c01');
    expect(targetSpeed(15).toHex()).toBe('02dc05');
  });
});
