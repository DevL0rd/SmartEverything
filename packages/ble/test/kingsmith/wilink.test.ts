import { describe, expect, it } from 'vitest';
import {
  WilinkFrameError,
  decodeWilink,
  hexToBytes,
  queryLatestRecordFrame,
  queryPreferencesFrame,
  splitWilink,
  statusRequest,
  wilinkChecksum,
} from '../../src';
import {
  goalFrame,
  pauseFrame,
  sensitivityFrame,
  setModeFrame,
  setSpeedFrame,
  speedLimitFrame,
  startFrame,
  toggleFrame,
} from '../../src/kingsmith/wilink';

const SAMPLE_ONE = 'f8a2010f01000fd10000ab0012ae3c0000003afd';
const SAMPLE_TWO = 'f8a2013c0100022a00004f0003d1b4000000e3fd';

function bytes(hex: string): Uint8Array {
  return hexToBytes(hex);
}

describe('WiLink commands', () => {
  it('encodes the frames the pad is known to accept', () => {
    expect(statusRequest().toHex()).toBe('f7a20000a2fd');
    expect(setSpeedFrame(2).toHex()).toBe('f7a20114b7fd');
    expect(setSpeedFrame(0).toHex()).toBe('f7a20100a3fd');
    expect(setModeFrame('manual').toHex()).toBe('f7a20201a5fd');
    expect(setModeFrame('auto').toHex()).toBe('f7a20200a4fd');
    expect(setModeFrame('standby').toHex()).toBe('f7a20202a6fd');
    expect(startFrame().toHex()).toBe('f7a20401a7fd');
    expect(pauseFrame().toHex()).toBe('f7a20501a8fd');
    expect(queryLatestRecordFrame().toHex()).toBe('f7a7aaff50fd');
    expect(queryPreferencesFrame().toHex()).toBe('f7a60000000000a6fd');
  });

  it('encodes preference writes as a key, a type and a 24-bit value', () => {
    expect(speedLimitFrame('maxSpeed', 6).toHex()).toBe('f7a6030000003ce5fd');
    expect(speedLimitFrame('startSpeed', 1.5).toHex()).toBe('f7a6040000000fb9fd');
    expect(toggleFrame('autoStart', true).toHex()).toBe('f7a60500000001acfd');
    expect(toggleFrame('childLock', false).toHex()).toBe('f7a60900000000affd');
    expect(sensitivityFrame('low').toHex()).toBe('f7a60600000003affd');
    expect(goalFrame('distance', 3000).toHex()).toBe('f7a60101000bb86bfd');
  });

  it('sums the bytes between the start and the checksum', () => {
    expect(wilinkChecksum(bytes('a20114'), 0, 3)).toBe(0xb7);
    expect(wilinkChecksum(new Uint8Array(0), 0, 0)).toBe(0);
  });
});

describe('WiLink status frames', () => {
  it('reads time, distance and steps from the recorded pad frames', () => {
    const first = decodeWilink(bytes(SAMPLE_ONE));
    expect(first).toStrictEqual({
      kind: 'status',
      reading: {
        state: 'running',
        mode: 'manual',
        targetSpeedKmh: 2,
        speedKmh: 1.5,
        timeS: 4049,
        distanceM: 1710,
        steps: 4782,
      },
      unknown: [],
    });
    expect(decodeWilink(bytes(SAMPLE_TWO))).toMatchObject({
      kind: 'status',
      reading: { speedKmh: 6, timeS: 554, distanceM: 790, steps: 977, targetSpeedKmh: 6 },
    });
  });

  it('reads the standby state and mode of a pad that sleeps', () => {
    const standby = frame([0xf8, 0xa2, 5, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(decodeWilink(standby)).toMatchObject({
      reading: { state: 'standby', mode: 'standby', speedKmh: 0 },
    });
  });

  it('maps every countdown byte and the panel buttons', () => {
    for (const state of [6, 7, 8, 9]) {
      expect(decodeWilink(statusWith({ 2: state }))).toMatchObject({
        reading: { state: 'countdown' },
      });
    }
    expect(decodeWilink(statusWith({ 16: 2 }))).toMatchObject({ reading: { button: 'up' } });
    expect(decodeWilink(statusWith({ 16: 3 }))).toMatchObject({ reading: { button: 'stop' } });
    expect(decodeWilink(statusWith({ 16: 4 }))).toMatchObject({ reading: { button: 'down' } });
  });

  it('reports the bytes it cannot name instead of guessing', () => {
    const decoded = decodeWilink(statusWith({ 2: 11, 15: 7, 16: 9, 17: 1 }));
    expect(decoded).toMatchObject({ kind: 'status' });
    expect(decoded.kind === 'status' ? decoded.unknown : []).toStrictEqual([
      { index: 15, value: 7 },
      { index: 17, value: 1 },
      { index: 16, value: 9 },
      { index: 2, value: 11 },
    ]);
    expect(decoded.kind === 'status' ? decoded.reading.state : 'x').toBeUndefined();
    expect(decoded.kind === 'status' ? decoded.reading.button : 'x').toBeUndefined();
  });

  it('refuses a frame that is short, unclosed, corrupt or of an unknown type', () => {
    expect(() => decodeWilink(bytes('f8a2fd'))).toThrow(WilinkFrameError);
    expect(() => decodeWilink(bytes(SAMPLE_ONE.slice(0, -2) + 'fc'))).toThrow(WilinkFrameError);
    expect(() => decodeWilink(bytes(SAMPLE_ONE.replace('3afd', '3bfd')))).toThrow(
      'checksum does not match',
    );
    expect(() => decodeWilink(frame([0xf8, 0xa9, ...new Array<number>(16).fill(0)]))).toThrow(
      'type A2, A6 or A7',
    );
  });
});

describe('WiLink preference and record frames', () => {
  it('reads the preference reply by the offsets two open implementations agree on', () => {
    const reply = frame([0xf8, 0xa6, 1, 0, 0x0b, 0xb8, 0, 60, 15, 1, 2, 5, 1, 1, 0, 0, 0, 0]);
    expect(decodeWilink(reply)).toStrictEqual({
      kind: 'preferences',
      preferences: {
        goalKind: 'distance',
        goalValue: 3000,
        maxSpeedKmh: 6,
        startSpeedKmh: 1.5,
        autoStart: true,
        sensitivity: 'medium',
        displayFields: ['time', 'distance'],
        childLock: true,
        units: 'mi',
      },
    });
  });

  it('reads an unknown goal code as no goal and leaves out an unknown sensitivity', () => {
    const reply = frame([0xf8, 0xa6, 9, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0]);
    const decoded = decodeWilink(reply);
    expect(decoded.kind === 'preferences' ? decoded.preferences.goalKind : 'x').toBe('none');
    expect(decoded.kind === 'preferences' ? decoded.preferences.sensitivity : 'x').toBeUndefined();
  });

  it('reads a stored record with the number left on the pad', () => {
    const record = frame([
      0xf8, 0xa7, 0, 1, 2, 0, 3, 4, 0, 0x0e, 0x10, 0, 0, 0xc8, 0, 0x0b, 0xb8, 3, 0, 0,
    ]);
    expect(decodeWilink(record)).toStrictEqual({
      kind: 'record',
      record: {
        onTime: 258,
        startTime: 772,
        durationS: 3600,
        distanceM: 2000,
        steps: 3000,
        remaining: 3,
      },
    });
  });
});

describe('WiLink frame splitter', () => {
  it('cuts merged notifications into frames', () => {
    const merged = bytes(SAMPLE_ONE + SAMPLE_TWO);
    const { frames, rest, dropped } = splitWilink(merged);
    expect(frames.map((entry) => entry.toHex())).toStrictEqual([SAMPLE_ONE, SAMPLE_TWO]);
    expect(rest.length).toBe(0);
    expect(dropped).toBe(0);
  });

  it('keeps the start of a frame until the rest arrives', () => {
    const first = splitWilink(bytes(SAMPLE_ONE.slice(0, 20)));
    expect(first.frames).toHaveLength(0);
    expect(first.rest.toHex()).toBe(SAMPLE_ONE.slice(0, 20));
    const second = splitWilink(bytes(first.rest.toHex() + SAMPLE_ONE.slice(20)));
    expect(second.frames.map((entry) => entry.toHex())).toStrictEqual([SAMPLE_ONE]);
  });

  it('drops bytes that are not a frame and counts them', () => {
    const { frames, dropped } = splitWilink(bytes('0102' + SAMPLE_TWO));
    expect(frames).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it('gives up on a start byte that never becomes a valid frame', () => {
    const noise = new Uint8Array(70).fill(1);
    noise[0] = 0xf8;
    const { frames, rest, dropped } = splitWilink(noise);
    expect(frames).toHaveLength(0);
    expect(rest.length).toBeLessThan(64);
    expect(dropped).toBeGreaterThan(0);
  });

  it('refuses to cut a status frame that is not 20 bytes long', () => {
    const body = [0xa2, 1, 0, 0];
    const crc = body.reduce((sum, byte) => sum + byte, 0) & 0xff;
    const short = Uint8Array.from([0xf8, ...body, crc, 0xfd]);
    expect(splitWilink(short).frames).toHaveLength(0);
  });
});

function frame(prefix: readonly number[]): Uint8Array {
  const body = [...prefix];
  while (body.length < 18) {
    body.push(0);
  }
  const crc = body.slice(1).reduce((sum, byte) => sum + byte, 0) & 0xff;
  return Uint8Array.from([...body, crc, 0xfd]);
}

function statusWith(changes: Readonly<Record<number, number>>): Uint8Array {
  const body = new Array<number>(18).fill(0);
  body[0] = 0xf8;
  body[1] = 0xa2;
  for (const [index, value] of Object.entries(changes)) {
    body[Number(index)] = value;
  }
  return frame(body);
}
