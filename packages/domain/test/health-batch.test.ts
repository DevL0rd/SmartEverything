import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import * as domain from '../src';
import {
  HEALTH_BATCH,
  HEALTH_BATCH_LIMIT,
  HEALTH_BATCH_SOURCE,
  HEALTH_INGEST_RESULT,
  affectedDays,
  localDayOf,
} from '../src';

function steps(recordId: string): unknown {
  return {
    recordId,
    type: 'Steps',
    startTime: '2026-10-08T06:00:00Z',
    endTime: '2026-10-08T07:00:00Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'com.mi.health',
    lastModified: '2026-10-08T07:01:00Z',
    data: { count: 10 },
  };
}

const SOURCE = { device: 'Pixel 9', appVersion: '0.1.0' };

function batch(overrides: Record<string, unknown>): unknown {
  return { records: [], deletions: [], grantedTypes: [], source: SOURCE, ...overrides };
}

function messageOf(candidate: unknown): string | undefined {
  return HEALTH_BATCH.safeParse(candidate).error?.issues[0]?.message;
}

const ids = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `id-${String(index)}`);

describe('health batch', () => {
  it('accepts records, deletions and granted types together', () => {
    const parsed = HEALTH_BATCH.parse(
      batch({
        records: [steps('a'), steps('b')],
        deletions: ['c'],
        grantedTypes: ['Steps', 'HeartRate'],
      }),
    );
    expect(parsed.records.map((record) => record.recordId)).toStrictEqual(['a', 'b']);
    expect(parsed.deletions).toStrictEqual(['c']);
    expect(parsed.grantedTypes).toStrictEqual(['Steps', 'HeartRate']);
    expect(parsed.source).toStrictEqual(SOURCE);
  });

  it('refuses the same record twice in one batch', () => {
    expect(messageOf(batch({ records: [steps('a'), steps('a')] }))).toBe(
      'each recordId may appear only once in a batch',
    );
  });

  it('refuses the same deletion twice in one batch', () => {
    expect(messageOf(batch({ deletions: ['a', 'a'] }))).toBe(
      'each deleted recordId may appear only once in a batch',
    );
  });

  it('refuses a granted type listed twice or unknown', () => {
    expect(messageOf(batch({ grantedTypes: ['Steps', 'Steps'] }))).toBe(
      'each granted type may appear only once',
    );
    expect(HEALTH_BATCH.safeParse(batch({ grantedTypes: ['Stairs'] })).success).toBe(false);
  });

  it('reads batches larger than the batch size senders use', () => {
    expect(HEALTH_BATCH_LIMIT).toBe(500);
    const over = ids(HEALTH_BATCH_LIMIT + 1);
    expect(HEALTH_BATCH.parse(batch({ records: over.map(steps) })).records).toHaveLength(
      over.length,
    );
    expect(HEALTH_BATCH.parse(batch({ deletions: over })).deletions).toHaveLength(over.length);
  });

  it('refuses an empty deletion id and ignores unknown envelope fields', () => {
    expect(HEALTH_BATCH.safeParse(batch({ deletions: [''] })).success).toBe(false);
    expect(HEALTH_BATCH.parse(batch({ cursor: 'x' }))).not.toHaveProperty('cursor');
  });

  it('requires a source description and reads long ones', () => {
    const accepts = (source: unknown): boolean => HEALTH_BATCH_SOURCE.safeParse(source).success;
    expect(accepts(SOURCE)).toBe(true);
    expect(accepts({ ...SOURCE, device: '' })).toBe(false);
    expect(accepts({ ...SOURCE, device: 'd'.repeat(500) })).toBe(true);
    expect(accepts({ ...SOURCE, appVersion: '' })).toBe(false);
    expect(accepts({ ...SOURCE, appVersion: 'v'.repeat(500) })).toBe(true);
    expect(HEALTH_BATCH_SOURCE.parse({ ...SOURCE, owner: 'x' })).toStrictEqual(SOURCE);
  });
});

describe('health ingest result', () => {
  it('accepts counts and calendar days', () => {
    const result = { stored: 3, stale: 1, deleted: 0, days: ['2026-10-08'] };
    expect(HEALTH_INGEST_RESULT.parse(result)).toStrictEqual(result);
  });

  it('refuses negative counts and malformed days', () => {
    const base = { stored: 0, stale: 0, deleted: 0, days: [] };
    expect(HEALTH_INGEST_RESULT.safeParse({ ...base, stored: -1 }).success).toBe(false);
    expect(HEALTH_INGEST_RESULT.safeParse({ ...base, days: ['2026-10-8'] }).success).toBe(false);
  });
});

describe('local days', () => {
  it('shifts the start time by the zone offset', () => {
    const anchor = {
      type: 'Steps',
      startTime: '2026-10-08T23:30:00Z',
      endTime: '2026-10-08T23:45:00Z',
      zoneOffsetSeconds: 3600,
    };
    expect(localDayOf(anchor)).toBe('2026-10-09');
    expect(localDayOf({ ...anchor, zoneOffsetSeconds: null })).toBe('2026-10-08');
    expect(localDayOf({ ...anchor, zoneOffsetSeconds: -86_400 })).toBe('2026-10-07');
  });

  it('places a sleep session on the day it ends', () => {
    const sleep = {
      type: 'SleepSession',
      startTime: '2026-10-07T22:00:00Z',
      endTime: '2026-10-08T06:00:00Z',
      zoneOffsetSeconds: 0,
    };
    expect(localDayOf(sleep)).toBe('2026-10-08');
    expect(localDayOf({ ...sleep, endTime: null })).toBe('2026-10-07');
    expect(localDayOf({ ...sleep, type: 'ExerciseSession' })).toBe('2026-10-07');
  });

  it('lists each affected day once, in calendar order', () => {
    const at = (startTime: string): Parameters<typeof localDayOf>[0] => ({
      type: 'Weight',
      startTime,
      endTime: null,
      zoneOffsetSeconds: 0,
    });
    expect(
      affectedDays([
        at('2026-10-09T01:00:00Z'),
        at('2026-10-07T01:00:00Z'),
        at('2026-10-09T05:00:00Z'),
      ]),
    ).toStrictEqual(['2026-10-07', '2026-10-09']);
    expect(affectedDays([])).toStrictEqual([]);
  });

  it('agrees with the database definition of a local day for any moment and offset', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2000-01-01T00:00:00Z'),
          max: new Date('2100-01-01T00:00:00Z'),
          noInvalidDate: true,
        }),
        fc.integer({ min: -64_800, max: 64_800 }),
        (moment, offset) => {
          const expected = new Date(moment.getTime() + offset * 1000).toISOString().slice(0, 10);
          const anchor = {
            type: 'Steps',
            startTime: moment.toISOString(),
            endTime: null,
            zoneOffsetSeconds: offset,
          };
          expect(localDayOf(anchor)).toBe(expected);
          expect(affectedDays([anchor, anchor])).toStrictEqual([expected]);
        },
      ),
    );
  });
});

describe('health upload credentials', () => {
  it('has no separate health source token any more', () => {
    expect(Object.keys(domain).filter((name) => /health.?source.?token/i.test(name))).toStrictEqual(
      [],
    );
  });
});
