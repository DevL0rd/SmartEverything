import type { DeviceCapability } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { DeviceValues } from '../../../store/state';
import { levelPercent, numberAt } from './reading';

const LEVEL: DeviceCapability = {
  key: 'water_level',
  label: 'Water',
  access: 'read',
  value: { kind: 'number', min: 0, max: 200, step: 1 },
};

describe('sensor card readings', () => {
  it('scales a level into a percentage of its own range', () => {
    expect(levelPercent(LEVEL, 50)).toBe(25);
    expect(levelPercent(LEVEL, null)).toBeNull();
  });

  it('reads a finite number and nothing else', () => {
    const values: DeviceValues = {
      pm25: { value: 12, observedAt: '2026-10-18T10:00:00Z' },
      text: { value: 'x', observedAt: '2026-10-18T10:00:00Z' },
    };
    expect(numberAt(values, 'pm25')).toBe(12);
    expect(numberAt(values, 'text')).toBeNull();
    expect(numberAt(values, 'missing')).toBeNull();
    expect(numberAt(values, undefined)).toBeNull();
  });
});
