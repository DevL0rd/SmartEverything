import { describe, expect, it } from 'vitest';
import { inputShapeOf } from '../src';

describe('inputShapeOf', () => {
  it('tags the inputs of the Xiaomi vacuum models only', () => {
    expect(inputShapeOf('urn:miot-spec-v2:device:vacuum:0000A006:xiaomi-pv11gl:1')).toBe('tagged');
    expect(inputShapeOf('urn:miot-spec-v2:device:vacuum:0000A006:roborock-s7:1')).toBe('plain');
    expect(inputShapeOf('urn:miot-spec-v2:device:camera:0000A01C:xiaomi-091ac1:1')).toBe('plain');
    expect(inputShapeOf('urn:miot-spec-v2:device:vacuum')).toBe('plain');
  });
});
