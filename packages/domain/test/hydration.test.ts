import { describe, expect, it } from 'vitest';
import { HEALTH_RECORD, hydrationAmounts, type HealthRecord } from '../src';

function water(recordId: string, liters: number, lastModified: string): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId,
    type: 'Hydration',
    startTime: '2026-10-08T06:00:00Z',
    endTime: '2026-10-08T06:01:00Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'smarteverything.entries',
    lastModified,
    data: { liters },
  });
}

const STEPS = HEALTH_RECORD.parse({
  recordId: 'steps-1',
  type: 'Steps',
  startTime: '2026-10-08T06:00:00Z',
  endTime: '2026-10-08T07:00:00Z',
  zoneOffsetSeconds: 0,
  sourceApp: 'smarteverything.entries',
  lastModified: '2026-10-08T07:01:00Z',
  data: { count: 10 },
});

describe('hydrationAmounts', () => {
  it('lists the litres of every hydration record and ignores other records', () => {
    expect(
      hydrationAmounts([
        water('a', 0.25, '2026-10-08T06:02:00Z'),
        STEPS,
        water('b', 0.5, '2026-10-08T06:03:00Z'),
      ]),
    ).toEqual([0.25, 0.5]);
  });

  it('counts a record that was written twice once, with its newest amount', () => {
    expect(
      hydrationAmounts([
        water('a', 0.25, '2026-10-08T06:02:00Z'),
        water('a', 0.3, '2026-10-08T06:05:00Z'),
        water('a', 0.1, '2026-10-08T06:01:00Z'),
      ]),
    ).toEqual([0.3]);
  });

  it('is empty without hydration records', () => {
    expect(hydrationAmounts([STEPS])).toEqual([]);
  });
});
