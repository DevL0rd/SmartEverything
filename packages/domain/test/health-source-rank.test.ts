import { describe, expect, it } from 'vitest';
import {
  HEALTH_RECORD,
  TREADMILL_SOURCE_APP,
  WATCH_SOURCE_APP,
  healthSourceRank,
  preferredShares,
  type HealthRecord,
} from '../src';

const PHONE = 'com.android.healthconnect.phone.j4891';

let counter = 0;

function record(
  type: string,
  sourceApp: string,
  [start, end]: readonly [string, string],
  data: object,
): HealthRecord {
  counter += 1;
  return HEALTH_RECORD.parse({
    recordId: `record-${String(counter)}`,
    type,
    startTime: `2026-10-18T${start}:00.000Z`,
    endTime: `2026-10-18T${end}:00.000Z`,
    zoneOffsetSeconds: 0,
    sourceApp,
    lastModified: '2026-10-18T23:00:00.000Z',
    data,
  });
}

function distance(sourceApp: string, start: string, end: string, meters: number): HealthRecord {
  return record('Distance', sourceApp, [start, end], { meters });
}

function counted(records: readonly HealthRecord[]): [string, number][] {
  return preferredShares(records).map(({ record: kept, share }) => [kept.sourceApp, share]);
}

describe('health source priority', () => {
  it('ranks the watch first, then other own sources such as the treadmill, wearables, other apps and the phone last', () => {
    const ranks = [
      WATCH_SOURCE_APP,
      TREADMILL_SOURCE_APP,
      'com.xiaomi.wearable',
      'com.example.other',
      PHONE,
    ].map(healthSourceRank);
    expect([...ranks].sort((left, right) => left - right)).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('per hour: the watch wins an hour it covers and the treadmill value for that hour is not added on top', () => {
    expect(
      counted([
        distance(WATCH_SOURCE_APP, '12:00', '12:41', 600),
        distance(TREADMILL_SOURCE_APP, '12:10', '12:40', 900),
      ]),
    ).toEqual([[WATCH_SOURCE_APP, 1]]);
  });

  it('per hour: falls back to the treadmill for an hour the watch has no data in', () => {
    expect(counted([distance(TREADMILL_SOURCE_APP, '12:10', '12:40', 900)])).toEqual([
      [TREADMILL_SOURCE_APP, 1],
    ]);
  });

  it('per hour: a treadmill session crossing into an hour the watch does not cover counts only that share', () => {
    const shares = counted([
      distance(WATCH_SOURCE_APP, '13:00', '13:55', 500),
      distance(TREADMILL_SOURCE_APP, '13:40', '14:20', 800),
    ]);
    expect(shares).toEqual([
      [WATCH_SOURCE_APP, 1],
      [TREADMILL_SOURCE_APP, 0.5],
    ]);
  });

  it('per hour: the phone sensor is dropped in hours a wearable covers', () => {
    expect(
      counted([
        record('ActiveCaloriesBurned', WATCH_SOURCE_APP, ['09:00', '09:30'], { kilocalories: 40 }),
        record('ActiveCaloriesBurned', PHONE, ['09:05', '09:10'], { kilocalories: 3 }),
      ]),
    ).toEqual([[WATCH_SOURCE_APP, 1]]);
  });

  it('per hour: each metric is ranked on its own, so watch steps do not hide treadmill distance', () => {
    expect(
      counted([
        record('Steps', WATCH_SOURCE_APP, ['12:00', '12:41'], { count: 900 }),
        distance(TREADMILL_SOURCE_APP, '12:10', '12:40', 900),
      ]),
    ).toEqual([
      [WATCH_SOURCE_APP, 1],
      [TREADMILL_SOURCE_APP, 1],
    ]);
  });

  it('keeps every record of the winning source and every record of types outside the hourly rule', () => {
    expect(
      counted([
        distance(WATCH_SOURCE_APP, '12:00', '12:07', 7),
        distance(WATCH_SOURCE_APP, '12:00', '12:41', 13),
        record('HeartRate', PHONE, ['12:00', '12:05'], {
          samples: [{ time: '2026-10-18T12:01:00.000Z', bpm: 80 }],
        }),
      ]),
    ).toEqual([
      [WATCH_SOURCE_APP, 1],
      [WATCH_SOURCE_APP, 1],
      [PHONE, 1],
    ]);
  });
});
