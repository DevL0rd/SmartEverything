import { describe, expect, it } from 'vitest';
import {
  VendorFrameError,
  decodeSupplement,
  emptySupplementState,
  hexToBytes,
  supplementStateOf,
} from '../../src';
import {
  functionInfoFrame,
  propertyWriteFrame,
  settingGetFrame,
  supplementFrame,
  systemInfoFrame,
  unlockFrame,
} from '../../src/kingsmith/vendor';

describe('supplement frames', () => {
  it('derives the unlock code from the last four characters of the public name', () => {
    expect(unlockFrame('KS-HD-Z1D').toHex()).toBe('710005012e5a314474');
  });

  it('encodes the requests the Z1 documentation lists', () => {
    expect(settingGetFrame().toHex()).toBe('7200010073');
    expect(functionInfoFrame().toHex()).toBe('75000075');
    expect(propertyWriteFrame(6, 1).toHex()).toBe('720103060100' + '7d');
    expect(systemInfoFrame(0x01020304).toHex()).toBe('710108040302010000000084');
    expect(supplementFrame(0x71, 0, []).toHex()).toBe('710000' + '71');
  });
});

function frameOf(first: number, second: number, data: readonly number[]): Uint8Array {
  return supplementFrame(first, second, data);
}

describe('supplement replies', () => {
  it('knows the unlock reply', () => {
    expect(decodeSupplement(hexToBytes('7180' + '00' + 'f1'))).toStrictEqual({ kind: 'unlocked' });
  });

  it('reads the system information', () => {
    const reply = frameOf(0x71, 0x81, [3, 0, 9, 0, 0x0f, 0x01, 0, 0]);
    expect(decodeSupplement(reply)).toStrictEqual({
      kind: 'system',
      protocol: 3,
      model: 9,
      capabilities: 0x10f,
    });
  });

  it('reads property records of four bytes', () => {
    const reply = frameOf(0x72, 0x80, [6, 0, 1, 0, 5, 0, 0, 0]);
    expect(decodeSupplement(reply)).toStrictEqual({
      kind: 'properties',
      properties: [
        { id: 6, error: 0, value: 1 },
        { id: 5, error: 0, value: 0 },
      ],
    });
    expect(decodeSupplement(frameOf(0x72, 0x50, [7, 0, 0x58, 0x02]))).toStrictEqual({
      kind: 'property_push',
      properties: [{ id: 7, error: 0, value: 600 }],
    });
  });

  it('passes the function bitmap and the records through as hex', () => {
    expect(decodeSupplement(frameOf(0x75, 0x80, [1, 2]))).toStrictEqual({
      kind: 'function_bitmap',
      hex: '0102',
    });
    expect(decodeSupplement(frameOf(0x73, 0x50, [9]))).toStrictEqual({
      kind: 'exercise_record',
      hex: '09',
    });
    expect(decodeSupplement(frameOf(0x73, 0x51, [3]))).toStrictEqual({
      kind: 'fault_record',
      hex: '03',
    });
  });

  it('refuses frames it cannot trust', () => {
    expect(() => decodeSupplement(hexToBytes('71'))).toThrow(VendorFrameError);
    expect(() => decodeSupplement(hexToBytes('7180' + '00' + 'f2'))).toThrow(
      'wrong length or checksum',
    );
    expect(() => decodeSupplement(hexToBytes('7180' + '05' + 'f1'))).toThrow(
      'wrong length or checksum',
    );
    expect(() => decodeSupplement(frameOf(0x70, 0x01, []))).toThrow('Expected a supplement reply');
  });
});

describe('supplement state', () => {
  it('turns property records into pad preferences', () => {
    const state = supplementStateOf(
      [
        { id: 1, error: 0, value: 1 },
        { id: 2, error: 0, value: 0x8000 | 600 },
        { id: 3, error: 0, value: 1 },
        { id: 4, error: 0, value: 5 },
        { id: 5, error: 0, value: 0 },
        { id: 6, error: 0, value: 1 },
        { id: 7, error: 0, value: 600 },
        { id: 8, error: 0, value: 0b1010 },
        { id: 13, error: 0, value: 3 },
      ],
      emptySupplementState(),
    );
    expect(state).toStrictEqual({
      preferences: {
        units: 'mi',
        autoStopSeconds: 600,
        paceDisplay: true,
        childLock: true,
        maxSpeedKmh: 6,
        buzzer: true,
        light: true,
        ledColor: 3,
      },
      motorVersion: 5,
      errorCode: 0,
      switches: 0b1010,
      mode: null,
    });
  });

  it('reads the mode status from bits 5 to 7 of property 10', () => {
    const modeOf = (value: number): string | null =>
      supplementStateOf([{ id: 10, error: 0, value }], emptySupplementState()).mode;
    expect(modeOf(0b00001111)).toBe('manual');
    expect(modeOf(0b00100000)).toBe('auto');
    expect(modeOf(0b01000011)).toBe('sleep');
    expect(modeOf(0b11100000)).toBeNull();
  });

  it('reads a disabled auto-stop as zero seconds and skips records with an error', () => {
    const state = supplementStateOf(
      [
        { id: 2, error: 0, value: 600 },
        { id: 6, error: 3, value: 1 },
        { id: 99, error: 0, value: 1 },
        { id: 1, error: 0, value: 2 },
      ],
      emptySupplementState(),
    );
    expect(state.preferences).toStrictEqual({ autoStopSeconds: 0, units: 'km' });
  });
});
