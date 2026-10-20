import { describe, expect, it } from 'vitest';
import { gateAllows, isStill, orientationOf } from '../../src';
import {
  codedFrame,
  concatBytes,
  encodeFloat,
  encodeVarint,
  nested,
  responseFrame,
} from './frames';

const GATE = { kind: 'upright_still', toleranceG: 0.15 } as const;

function tilt(x: number, y: number, z: number): Uint8Array {
  return responseFrame(
    1,
    'RequestGetCapAccelerometerState',
    nested(encodeFloat(1, x), encodeFloat(2, y), encodeFloat(3, z)),
  );
}

describe('LARQ orientation', () => {
  it('tells upright, on its side, upside down and tilted apart', () => {
    expect(orientationOf({ x: 0.02, y: -0.03, z: 0.99 })).toBe('upright');
    expect(orientationOf({ x: 0.98, y: 0.02, z: 0.05 })).toBe('side');
    expect(orientationOf({ x: 0.02, y: -0.97, z: -0.05 })).toBe('side');
    expect(orientationOf({ x: 0, y: 0.01, z: -0.99 })).toBe('upside_down');
    expect(orientationOf({ x: 0.5, y: 0.2, z: 0.8 })).toBe('tilted');
    expect(orientationOf({ x: 0.5, y: 0, z: 0.5 })).toBe('tilted');
  });

  it('uses the tolerance it is given', () => {
    expect(orientationOf({ x: 0.2, y: 0, z: 0.97 })).toBe('tilted');
    expect(orientationOf({ x: 0.2, y: 0, z: 0.97 }, 0.25)).toBe('upright');
  });

  it('calls a reading still when its total is about one g', () => {
    expect(isStill({ x: 0, y: 0, z: 1.02 })).toBe(true);
    expect(isStill({ x: 0, y: 0, z: 1.4 })).toBe(false);
    expect(isStill({ x: 0, y: 0, z: 0.6 })).toBe(false);
  });

  it('lets a measurement go on only for an upright, still bottle', () => {
    expect(gateAllows(tilt(0, 0.01, 1), GATE)).toBe(true);
    expect(gateAllows(tilt(0.9, 0, 0.1), GATE)).toBe(false);
    expect(gateAllows(tilt(0, 0, 1.6), GATE)).toBe(false);
  });

  it('refuses when the cap did not answer the accelerometer request', () => {
    expect(gateAllows(codedFrame(1, 2), GATE)).toBe(false);
    expect(() =>
      gateAllows(responseFrame(1, 'RequestGetCapTofState', concatBytes(encodeVarint(1, 1))), GATE),
    ).toThrow(/ResponseGetCapAccelerometerState/u);
  });
});
