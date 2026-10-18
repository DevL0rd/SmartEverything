import {
  HEALTH_RECORD,
  foodEntryOf,
  localDayOf,
  waterEntryOf,
  zoneOffsetSeconds,
  type FoodCandidate,
  type HealthEntryInput,
  type HealthRecord,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { dailyFigures } from '../../src/store/health-daily';

const ZONE = 'Asia/Bangkok';

const CRISPS: FoodCandidate = {
  name: 'Crisps',
  brand: null,
  barcode: null,
  kind: 'food',
  basis: { amount: 100, unit: 'g' },
  serving: null,
  kcal: 500,
  grams: {},
  water_percent: 0,
};

function spanAt(start: Date): {
  startTime: string;
  endTime: string;
  zoneOffsetSeconds: number;
} {
  return {
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 60_000).toISOString(),
    zoneOffsetSeconds: zoneOffsetSeconds(ZONE, start),
  };
}

function recordOf(entry: HealthEntryInput, recordId: string): HealthRecord {
  return HEALTH_RECORD.parse({
    recordId,
    type: entry.type,
    startTime: entry.startTime,
    endTime: entry.endTime,
    zoneOffsetSeconds: entry.zoneOffsetSeconds,
    sourceApp: 'smarteverything.entries',
    lastModified: entry.startTime,
    data: entry.data,
  });
}

function figure(records: readonly HealthRecord[], metric: string): number | undefined {
  return dailyFigures(records).find((entry) => entry.metric === metric)?.value;
}

describe('logging on an earlier day', () => {
  const justAfterMidnight = new Date('2026-10-10T17:30:00Z');
  const thisMorning = new Date('2026-10-10T20:00:00Z');
  const food = recordOf(
    foodEntryOf({
      food: CRISPS,
      foodId: null,
      amount: 100,
      mealType: 4,
      span: spanAt(justAfterMidnight),
    }),
    'f1',
  );
  const water = recordOf(waterEntryOf(1000, spanAt(thisMorning)), 'w1');

  it('puts an entry after local midnight on the next local day, not the UTC day', () => {
    expect(localDayOf(food)).toBe('2026-10-11');
    expect(localDayOf(water)).toBe('2026-10-11');
  });

  it('puts yesterday evening in yesterday and counts it once', () => {
    const evening = recordOf(
      foodEntryOf({
        food: CRISPS,
        foodId: null,
        amount: 100,
        mealType: 4,
        span: spanAt(new Date('2026-10-10T14:00:00Z')),
      }),
      'f2',
    );
    expect(localDayOf(evening)).toBe('2026-10-10');
    expect(figure([evening], 'energy_in')).toBe(500);
    expect(figure([food, water], 'energy_in')).toBe(500);
    expect(figure([food, water], 'hydration')).toBe(1);
  });
});
