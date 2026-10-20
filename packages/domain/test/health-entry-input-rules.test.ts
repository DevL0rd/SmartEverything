import { describe, expect, it } from 'vitest';
import { HEALTH_ENTRY_INPUT } from '../src/health-entries';

const WEIGHT = {
  type: 'Weight',
  startTime: '2026-10-08T07:00:00Z',
  endTime: null,
  zoneOffsetSeconds: 0,
  data: { kilograms: 70 },
  food: null,
};

const PORTION = {
  foodId: null,
  name: 'Soup',
  amount: 300,
  unit: 'g',
  label: '1 bowl',
  waterMl: 250,
};

describe('HEALTH_ENTRY_INPUT rules', () => {
  it('refuses a portion on an entry that is not a food entry', () => {
    const parsed = HEALTH_ENTRY_INPUT.safeParse({ ...WEIGHT, food: PORTION });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({ message: 'only food entries carry a portion', path: ['food'] }),
    ]);
  });

  it('reports what the record schema refuses, at the place it refuses it', () => {
    const parsed = HEALTH_ENTRY_INPUT.safeParse({ ...WEIGHT, data: { kilograms: 'heavy' } });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['data', 'kilograms']]);
  });

  it('refuses an interval type without an end', () => {
    expect(
      HEALTH_ENTRY_INPUT.safeParse({
        ...WEIGHT,
        type: 'SleepSession',
        data: { title: null, notes: null, stages: [] },
      }).success,
    ).toBe(false);
  });

  it('refuses a type that cannot be logged by hand', () => {
    expect(
      HEALTH_ENTRY_INPUT.safeParse({ ...WEIGHT, type: 'Steps', data: { count: 10 } }).success,
    ).toBe(false);
  });
});
