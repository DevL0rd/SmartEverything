import { describe, expect, it } from 'vitest';
import {
  levelPercent,
  levelRangeOf,
  levelValue,
  type DeviceCapability,
  type LevelRange,
  type PresentedCapability,
} from '../src';

const OWN_SCALE: LevelRange = { min: 1, max: 100, step: 1, unit: null };
const PERCENT_UNIT: LevelRange = { min: 0, max: 254, step: 1, unit: '%' };
const WIDE: LevelRange = { min: 10, max: 1000, step: 10, unit: null };
const BYTE: LevelRange = { min: 0, max: 254, step: 1, unit: null };

describe('level percent', () => {
  it('shows a 1 to 100 scale as its own value, so every face agrees', () => {
    for (const value of [1, 8, 39, 40, 49, 50, 100]) {
      expect(levelPercent(OWN_SCALE, value)).toBe(value);
      expect(levelValue(OWN_SCALE, value)).toBe(value);
    }
  });

  it('shows a 0 to 100 scale as its own value', () => {
    const zero: LevelRange = { min: 0, max: 100, step: 5, unit: null };
    expect(levelPercent(zero, 40)).toBe(40);
    expect(levelValue(zero, 40)).toBe(40);
  });

  it('treats a percent unit as the value itself whatever the range', () => {
    expect(levelPercent(PERCENT_UNIT, 60)).toBe(60);
    expect(levelValue(PERCENT_UNIT, 60)).toBe(60);
  });

  it('maps any other range to the share between its ends', () => {
    expect(levelPercent(BYTE, 127)).toBe(50);
    expect(levelPercent(WIDE, 505)).toBe(50);
    expect(levelValue(BYTE, 50)).toBe(127);
    expect(levelValue(WIDE, 50)).toBe(510);
    expect(levelValue(WIDE, 33)).toBe(340);
  });

  it('never shows an empty or overfull level', () => {
    expect(levelPercent(WIDE, 10)).toBe(1);
    expect(levelPercent(WIDE, 2000)).toBe(100);
    expect(levelPercent(OWN_SCALE, 0)).toBe(1);
    expect(levelPercent(OWN_SCALE, 400)).toBe(100);
  });

  it('keeps a written value on the device step and inside its range', () => {
    expect(levelValue(WIDE, 0)).toBe(10);
    expect(levelValue(WIDE, 100)).toBe(1000);
    expect(levelValue({ min: 1, max: 9, step: 2, unit: null }, 100)).toBe(9);
    expect(levelValue({ min: 0, max: 100, step: 25, unit: null }, 60)).toBe(50);
  });

  it('reads a flat range as full', () => {
    expect(levelPercent({ min: 5, max: 5, step: 1, unit: null }, 5)).toBe(100);
  });
});

function presented(value: DeviceCapability['value'], unit: string | null): PresentedCapability {
  return {
    key: 'brightness',
    label: 'Brightness',
    group: 'lighting',
    groupLabel: 'Lighting',
    tier: 'primary',
    role: 'brightness',
    danger: { tier: 'none' },
    writable: true,
    options: [],
    unit,
    states: null,
    clock: null,
    capability: { key: 'brightness', label: 'Brightness', access: 'read_write', value },
  };
}

describe('level range of a presented capability', () => {
  it('is the number descriptor with the presented unit winning over the descriptor unit', () => {
    expect(
      levelRangeOf(presented({ kind: 'number', min: 0, max: 5, step: 1, unit: 'a' }, 'b')),
    ).toStrictEqual({ min: 0, max: 5, step: 1, unit: 'b' });
    expect(
      levelRangeOf(presented({ kind: 'number', min: 0, max: 5, step: 1, unit: 'a' }, null)),
    ).toStrictEqual({ min: 0, max: 5, step: 1, unit: 'a' });
    expect(
      levelRangeOf(presented({ kind: 'number', min: 0, max: 5, step: 1 }, null)),
    ).toStrictEqual({ min: 0, max: 5, step: 1, unit: null });
  });

  it('is nothing for a capability that is not a number', () => {
    expect(levelRangeOf(presented({ kind: 'boolean' }, null))).toBeNull();
  });
});
