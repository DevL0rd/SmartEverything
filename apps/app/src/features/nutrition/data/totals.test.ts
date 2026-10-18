import { describe, expect, it } from 'vitest';
import { HEALTH_RECORD, type HealthRecord } from '@smarteverything/domain';
import { withRecordHydration } from './totals';

function hydration(recordId: string, liters: number): HealthRecord {
  return HEALTH_RECORD.parse({
    type: 'Hydration',
    recordId,
    startTime: '2026-10-16T08:00:00.000Z',
    endTime: '2026-10-16T08:01:00.000Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'test',
    lastModified: '2026-10-16T08:01:00.000Z',
    data: { liters },
  });
}

describe('withRecordHydration', () => {
  it('keeps the stored daily hydration when the daily row has it', () => {
    const totals = { hydration: 1.5, protein: 20 };
    expect(withRecordHydration(totals, [hydration('a', 0.25)])).toBe(totals);
  });

  it('uses the sum of day records when the daily row has no hydration', () => {
    expect(
      withRecordHydration({ protein: 20 }, [hydration('a', 0.25), hydration('b', 0.5)]),
    ).toEqual({ protein: 20, hydration: 0.75 });
  });

  it('leaves totals untouched while records are still loading', () => {
    const totals = { protein: 20 };
    expect(withRecordHydration(totals, undefined)).toBe(totals);
  });
});
