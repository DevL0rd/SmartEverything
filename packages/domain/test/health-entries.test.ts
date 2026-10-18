import { describe, expect, it } from 'vitest';
import { HEALTH_ENTRY_INPUT } from '../src';

const ENTRY = {
  type: 'Weight',
  startTime: '2026-10-08T07:00:00Z',
  endTime: null,
  zoneOffsetSeconds: 0,
  food: null,
};

describe('HEALTH_ENTRY_INPUT', () => {
  it('parses an entry whose data has only known fields', () => {
    const parsed = HEALTH_ENTRY_INPUT.safeParse({ ...ENTRY, data: { kilograms: 70 } });
    expect(parsed.success).toBe(true);
  });

  it('refuses an unknown key inside data', () => {
    const parsed = HEALTH_ENTRY_INPUT.safeParse({ ...ENTRY, data: { kilograms: 70, junk: 1 } });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['data', 'junk']]);
  });

  it('stores only known fields inside nested data objects', () => {
    const parsed = HEALTH_ENTRY_INPUT.parse({
      ...ENTRY,
      type: 'SleepSession',
      endTime: '2026-10-08T15:00:00Z',
      data: {
        title: null,
        notes: null,
        stages: [
          { startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', stage: 5, junk: 1 },
        ],
      },
    });
    expect(parsed.data).toEqual({
      title: null,
      notes: null,
      stages: [{ startTime: '2026-10-08T07:00:00Z', endTime: '2026-10-08T08:00:00Z', stage: 5 }],
    });
  });
});
