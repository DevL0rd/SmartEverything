import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANGE,
  TREND_RANGES,
  cardPoints,
  rangeOf,
  trendOf,
  weeklyAverages,
} from './trend-model';
import { LIVE_KG, NOW, daysAgo, readingOf } from '../../../store/body-fixture';
import { weighInsOf } from './weigh-ins';

const DAY = 86_400_000;

function live(): ReturnType<typeof weighInsOf> {
  return weighInsOf(
    LIVE_KG.map((weight_kg, index) =>
      readingOf({ weight_kg, measured_at: daysAgo(LIVE_KG.length - index) }),
    ),
  );
}

describe('weight trend', () => {
  it('lists the flagged readings of the range as not counted and leaves them off the line', () => {
    const trend = trendOf(live(), '30d', NOW);
    expect(trend.notCounted.map((weighIn) => weighIn.kg)).toEqual([204.7, 10.1]);
    expect(trend.counted).toHaveLength(6);
  });

  it('keeps only the weigh-ins inside the chosen range', () => {
    const weighIns = weighInsOf([
      readingOf({ weight_kg: 90, measured_at: daysAgo(40) }),
      readingOf({ weight_kg: 89, measured_at: daysAgo(10) }),
      readingOf({ weight_kg: 88, measured_at: daysAgo(2) }),
    ]);
    const sizes = TREND_RANGES.map((range) => trendOf(weighIns, range.value, NOW).counted.length);
    expect(sizes).toEqual([1, 2, 3, 3]);
  });

  it('starts on 30 days and throws on a range it does not know', () => {
    expect(DEFAULT_RANGE).toBe('30d');
    expect(rangeOf('90d').days).toBe(90);
  });

  it('averages the readings of each week at the week end', () => {
    const points = [
      { t: 1 * DAY, v: 90 },
      { t: 2 * DAY, v: 88 },
      { t: 8 * DAY, v: 87 },
    ];
    expect(weeklyAverages(points)).toEqual([
      { t: 2 * DAY, v: 89 },
      { t: 8 * DAY, v: 87 },
    ]);
  });

  it('draws weekly averages on the panel and the raw points when there are fewer than two weeks', () => {
    const raw = [
      { t: NOW - 3 * DAY, v: 90 },
      { t: NOW - 2 * DAY, v: 89 },
    ];
    expect(cardPoints(raw, 90, true, NOW)).toEqual(raw);
    expect(cardPoints(raw, 90, false, NOW)).toEqual(raw);
    const long = Array.from({ length: 30 }, (_, index) => ({ t: NOW - index * DAY, v: 88 }));
    expect(cardPoints(long, 90, true, NOW).length).toBeLessThan(30);
    expect(cardPoints(long, 7, false, NOW)).toHaveLength(8);
  });
});
