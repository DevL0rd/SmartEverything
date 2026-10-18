import { describe, expect, it } from 'vitest';
import {
  SETTINGS_ROW,
  DEVICE_REFILLS,
  DIFFUSER_STRENGTH_LABELS,
  diffuserStrength,
  hoursSinceRefill,
  strengthPlan,
  withRefill,
} from '../src';

describe('scent diffuser strength', () => {
  it('recognises the three presets from the interval and duration the diffuser reports', () => {
    expect(diffuserStrength({ intervalMinutes: 20, durationSeconds: 2 })).toBe('light');
    expect(diffuserStrength({ intervalMinutes: 15, durationSeconds: 4 })).toBe('medium');
    expect(diffuserStrength({ intervalMinutes: 10, durationSeconds: 6 })).toBe('strong');
  });

  it('calls any other combination custom', () => {
    expect(diffuserStrength({ intervalMinutes: 10, durationSeconds: 2 })).toBe('custom');
  });

  it('writes the interval before the duration', () => {
    expect(strengthPlan('medium')).toEqual([
      { role: 'spray_interval', value: 15 },
      { role: 'spray_duration', value: 4 },
    ]);
  });

  it('only plans values the diffuser accepts', () => {
    for (const id of ['light', 'medium', 'strong'] as const) {
      const [interval, duration] = strengthPlan(id);
      expect([10, 15, 20]).toContain(interval.value);
      expect(duration.value).toBeGreaterThanOrEqual(2);
      expect(duration.value).toBeLessThanOrEqual(6);
    }
  });

  it('has a word for every strength, including a custom rhythm', () => {
    expect(Object.values(DIFFUSER_STRENGTH_LABELS)).toEqual([
      'Light',
      'Medium',
      'Strong',
      'Custom',
    ]);
  });
});

describe('diffuser refill record', () => {
  const NOW = new Date('2026-10-18T12:00:00.000Z');
  const FIRST = '00000000-0000-4000-8000-0000000000d1';
  const SECOND = '00000000-0000-4000-8000-0000000000d2';

  it('stores the refill time for one diffuser and keeps the others', () => {
    const first = withRefill({}, FIRST, new Date('2026-10-16T19:00:00.000Z'));
    const both = withRefill(first, SECOND, NOW);
    expect(both).toEqual({
      [FIRST]: '2026-10-16T19:00:00.000Z',
      [SECOND]: '2026-10-18T12:00:00.000Z',
    });
  });

  it('counts whole hours since the refill and never goes negative', () => {
    expect(hoursSinceRefill('2026-10-16T19:00:00.000Z', NOW)).toBe(41);
    expect(hoursSinceRefill('2026-10-19T00:00:00.000Z', NOW)).toBe(0);
  });

  it('refuses a refill that is not a time or a device that is not an id', () => {
    expect(DEVICE_REFILLS.safeParse({ [FIRST]: 'yesterday' }).success).toBe(false);
    expect(DEVICE_REFILLS.safeParse({ a: '2026-10-16T19:00:00.000Z' }).success).toBe(false);
  });

  it('is part of the household settings and starts empty', () => {
    expect(SETTINGS_ROW.shape.device_refills.parse(undefined)).toEqual({});
  });
});
