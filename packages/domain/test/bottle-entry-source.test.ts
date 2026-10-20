import { describe, expect, it } from 'vitest';
import {
  ENTRIES_SOURCE_APP,
  HEALTH_ENTRY_ROW,
  entryRecord,
  entryRecords,
  isOwnSource,
  type HealthEntryRow,
} from '../src';

const ROW = {
  id: '8a1b3c2d-0000-4000-8000-000000000001',
  profile_id: '8a1b3c2d-0000-4000-8000-000000000002',
  record_type: 'Hydration',
  start_time: '2026-10-18T10:00:00.000Z',
  end_time: '2026-10-18T10:01:00.000Z',
  zone_offset_seconds: 0,
  data: { liters: 0.25 },
  food: null,
  version: 1,
  created_at: '2026-10-18T10:01:00.000Z',
  updated_at: '2026-10-18T10:01:00.000Z',
};

function row(source: HealthEntryRow['source']): HealthEntryRow {
  return HEALTH_ENTRY_ROW.parse({ ...ROW, source });
}

describe('where a water entry comes from', () => {
  it('has no source when it was logged by hand, and is written under the entries app', () => {
    expect(HEALTH_ENTRY_ROW.parse(ROW).source).toBeNull();
    expect(entryRecord(row(null)).sourceApp).toBe(ENTRIES_SOURCE_APP);
  });

  it('is written under its own app when it comes from a bottle, which is still one of ours', () => {
    const record = entryRecord(row('larq'));
    expect(record.sourceApp).toBe('smarteverything.larq');
    expect(isOwnSource(record.sourceApp)).toBe(true);
    expect(entryRecords(row('larq')).map((item) => item.sourceApp)).toStrictEqual([
      'smarteverything.larq',
    ]);
  });

  it('refuses a source nobody knows', () => {
    expect(HEALTH_ENTRY_ROW.safeParse({ ...ROW, source: 'mystery' }).success).toBe(false);
  });
});
