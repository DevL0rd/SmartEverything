import { HEALTH_METRICS, HEALTH_RECORD_TYPES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { bestBucket, bucketise, summarise, trendOf } from './aggregate';
import {
  SERIES,
  formatAmount,
  formatReading,
  groupLabel,
  isSeriesKey,
  seriesInGroup,
  seriesOf,
  seriesOfType,
} from './catalogue';
import { baselineOf, figureOn, latestFigure, pointsOfDaily } from './daily';
import { pointsOfRecords } from './points';
import { trendWords } from './format';
import { barsOf, headlineLabel, rangeBucketsOf, seriesStats } from './series-stats';
import { at, seedRecord } from './test-support';
import { windowOf } from './window';
import { DAY_MS, startOfDayKey } from '../../../format/time';

const THURSDAY_END = startOfDayKey('2026-10-08') + DAY_MS;
const FAR_FUTURE = startOfDayKey('2027-01-01');

describe('the health series catalogue', () => {
  it('maps every Health Connect record type to exactly one series', () => {
    for (const type of HEALTH_RECORD_TYPES) {
      expect(SERIES.filter((spec) => spec.type === type)).toHaveLength(1);
    }
  });

  it('covers every daily metric the server computes', () => {
    const covered = SERIES.flatMap((spec) => [
      spec.daily,
      spec.dailyRange?.min ?? null,
      spec.dailyRange?.max ?? null,
    ]);
    const shownElsewhere = new Set<string>([
      'protein',
      'carbohydrate',
      'fat',
      'fiber',
      'sugar',
      'saturated_fat',
      'sodium',
      'caffeine',
      'stress_average',
      'stress_maximum',
      'vitality',
    ]);
    for (const metric of HEALTH_METRICS) {
      if (shownElsewhere.has(metric)) {
        expect(covered).not.toContain(metric);
      } else {
        expect(covered).toContain(metric);
      }
    }
  });

  it('keys are unique and resolvable', () => {
    expect(new Set(SERIES.map((spec) => spec.key)).size).toBe(SERIES.length);
    expect(seriesOf('steps').type).toBe('Steps');
    expect(isSeriesKey('steps')).toBe(true);
    expect(isSeriesKey('nonsense')).toBe(false);
    expect(() => seriesOf('nonsense')).toThrow('There is no health measure called nonsense.');
    expect(seriesOfType('Weight').key).toBe('weight');
    expect(seriesInGroup('body').map((spec) => spec.key)).toContain('height');
    expect(groupLabel('cycle')).toBe('Cycle tracking');
  });

  it('formats amounts with their scale and unit', () => {
    expect(formatReading(seriesOf('distance'), 5230)).toBe('5.23\u00a0km');
    expect(formatReading(seriesOf('height'), 1.82)).toBe('182\u00a0cm');
    expect(formatReading(seriesOf('oxygen_saturation'), 97)).toBe('97%');
    expect(formatAmount(seriesOf('steps'), 12_400)).toBe('12.4K');
    expect(formatAmount(seriesOf('steps'), 8204)).toBe('8,204');
  });
});

describe('series points and aggregation', () => {
  const steps = seriesOf('steps');
  const records = [
    seedRecord({ type: 'Steps', start: at(6, 8), end: at(6, 9), data: { count: 3000 } }),
    seedRecord({ type: 'Steps', start: at(6, 18), end: at(6, 19), data: { count: 2000 } }),
    seedRecord({ type: 'Steps', start: at(8, 7), end: at(8, 8), data: { count: 4000 } }),
    seedRecord({ type: 'Weight', start: at(8, 7), data: { kilograms: 80 } }),
  ];

  it('extracts only the records of the series type, in time order', () => {
    const points = pointsOfRecords(steps, records);
    expect(points.map((point) => point.value)).toEqual([3000, 2000, 4000]);
  });

  it('sums buckets for summed measures and leaves empty buckets empty', () => {
    const window = windowOf('week', '2026-10-08');
    const buckets = bucketise(steps, window, pointsOfRecords(steps, records), THURSDAY_END);
    expect(buckets.map((bucket) => bucket.value)).toEqual([
      null,
      5000,
      null,
      4000,
      null,
      null,
      null,
    ]);
    expect(bestBucket(steps, buckets)?.label).toBe('Tue');
  });

  it('averages a running period over the days elapsed so far, not only the days with data', () => {
    const summary = summarise(
      steps,
      windowOf('week', '2026-10-08'),
      pointsOfRecords(steps, records),
      THURSDAY_END,
    );
    expect(summary.total).toBe(9000);
    expect(summary.headline).toBe(2250);
    expect(summary.count).toBe(3);
  });

  it('averages a finished period over all of its days', () => {
    const summary = summarise(
      steps,
      windowOf('week', '2026-10-08'),
      pointsOfRecords(steps, records),
      FAR_FUTURE,
    );
    expect(summary.headline).toBe(9000 / 7);
  });

  it('a single day headline is the day total', () => {
    const summary = summarise(
      steps,
      windowOf('day', '2026-10-06'),
      pointsOfRecords(steps, records),
      FAR_FUTURE,
    );
    expect(summary.headline).toBe(5000);
  });

  it('an empty period has no figures', () => {
    const summary = summarise(
      steps,
      windowOf('day', '2026-10-01'),
      pointsOfRecords(steps, records),
      FAR_FUTURE,
    );
    expect(summary).toEqual({
      headline: null,
      total: null,
      low: null,
      high: null,
      latest: null,
      count: 0,
    });
  });

  it('latest measures report the newest reading', () => {
    const weight = seriesOf('weight');
    const points = pointsOfRecords(weight, [
      seedRecord({ type: 'Weight', start: at(3, 7), data: { kilograms: 81 } }),
      seedRecord({ type: 'Weight', start: at(5, 7), data: { kilograms: 79.5 } }),
    ]);
    const summary = summarise(weight, windowOf('week', '2026-10-05'), points, FAR_FUTURE);
    expect(summary.headline).toBe(79.5);
    expect(summary.low).toBe(79.5);
  });

  it('blood pressure keeps diastolic as the low end of each reading', () => {
    const pressure = seriesOf('blood_pressure');
    const points = pointsOfRecords(pressure, [
      seedRecord({
        type: 'BloodPressure',
        start: at(8, 7),
        data: { systolicMmHg: 122, diastolicMmHg: 78, bodyPosition: 0, measurementLocation: 0 },
      }),
    ]);
    expect(points).toEqual([{ at: at(8, 7).getTime(), value: 122, low: 78, high: 122 }]);
  });

  it('heart rate samples become one point each and daily rows carry their range', () => {
    const heart = seriesOf('heart_rate');
    const samples = pointsOfRecords(heart, [
      seedRecord({
        type: 'HeartRate',
        start: at(8, 7),
        end: at(8, 7, 2),
        data: {
          samples: [
            { time: at(8, 7).toISOString(), bpm: 60 },
            { time: at(8, 7, 1).toISOString(), bpm: 90 },
          ],
        },
      }),
    ]);
    expect(samples.map((point) => point.value)).toEqual([60, 90]);
    const daily = pointsOfDaily(heart, [
      { day: '2026-10-08', metric: 'heart_rate_average', value: 70 },
      { day: '2026-10-08', metric: 'heart_rate_minimum', value: 50 },
      { day: '2026-10-08', metric: 'heart_rate_maximum', value: 150 },
      { day: '2026-10-08', metric: 'steps', value: 9000 },
    ]);
    expect(daily).toEqual([{ at: at(8, 12).getTime(), value: 70, low: 50, high: 150 }]);
    expect(pointsOfDaily(seriesOf('blood_pressure'), [])).toEqual([]);
  });

  it('year buckets average summed measures per elapsed day of the month', () => {
    const points = pointsOfDaily(steps, [
      { day: '2026-10-01', metric: 'steps', value: 6000 },
      { day: '2026-10-02', metric: 'steps', value: 10_000 },
    ]);
    const year = windowOf('year', '2026-10-08');
    expect(bucketise(steps, year, points, THURSDAY_END)[9]?.value).toBe(16_000 / 8);
    expect(bucketise(steps, year, points, FAR_FUTURE)[9]?.value).toBe(16_000 / 31);
  });

  it('counts occurrence series instead of averaging them', () => {
    const tests = seriesOf('ovulation_test');
    const points = pointsOfRecords(tests, [
      seedRecord({ type: 'OvulationTest', start: at(7, 8), data: { result: 1 } }),
    ]);
    const summary = summarise(tests, windowOf('week', '2026-10-08'), points, THURSDAY_END);
    expect(summary.headline).toBe(1);
    expect(headlineLabel(tests, 'week')).toBe('Count');
    expect(headlineLabel(tests, 'day')).toBe('Count');
    expect(headlineLabel(steps, 'week')).toBe('Daily average');
    expect(headlineLabel(steps, 'day')).toBe('Total');
  });

  it('keeps every bucket for range charts, empty ones as gaps, with the bar tick labels', () => {
    const heart = seriesOf('heart_rate');
    const week = windowOf('week', '2026-10-08');
    const points = pointsOfDaily(heart, [
      { day: '2026-10-06', metric: 'heart_rate_average', value: 70 },
      { day: '2026-10-06', metric: 'heart_rate_minimum', value: 50 },
      { day: '2026-10-06', metric: 'heart_rate_maximum', value: 150 },
    ]);
    const buckets = bucketise(heart, week, points, THURSDAY_END);
    const ranges = rangeBucketsOf('week', buckets);
    expect(ranges).toHaveLength(7);
    expect(ranges.map((bucket) => bucket.label)).toEqual(
      barsOf('week', buckets).map((bar) => bar.label),
    );
    expect(ranges.map((bucket) => [bucket.min, bucket.max])).toEqual([
      [null, null],
      [50, 150],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it('labels the previous period by name only when it is the one just gone', () => {
    const week = windowOf('week', '2026-10-08');
    const points = pointsOfRecords(steps, records);
    const facts = (current: boolean): ReturnType<typeof seriesStats> =>
      seriesStats({
        spec: steps,
        range: 'week',
        current,
        summary: summarise(steps, week, points, THURSDAY_END),
        previous: {
          headline: 100,
          total: 700,
          low: 100,
          high: 100,
          latest: 100,
          count: 1,
        },
        trend: null,
        buckets: [],
      });
    expect(facts(true).map((stat) => stat.label)).toContain('Last week');
    expect(facts(false).map((stat) => stat.label)).toContain('Previous week');
  });

  it('trends say whether a change is good for the measure', () => {
    expect(trendOf(110, 100, 'higher')).toEqual({
      delta: 10,
      percent: 10,
      direction: 'up',
      good: true,
    });
    expect(trendOf(60, 55, 'lower')?.good).toBe(false);
    expect(trendOf(5, 5, 'higher')?.direction).toBe('flat');
    expect(trendOf(5, 0, 'neither')).toEqual({
      delta: 5,
      percent: null,
      direction: 'up',
      good: null,
    });
    expect(trendOf(null, 5, 'higher')).toBeNull();
  });

  it('the best bucket of a lower-is-better measure is the lowest', () => {
    const resting = seriesOf('resting_heart_rate');
    const buckets = [
      { label: 'a', start: 0, end: 1, value: 58, low: 58, high: 58 },
      { label: 'b', start: 1, end: 2, value: 52, low: 52, high: 52 },
      { label: 'c', start: 2, end: 3, value: null, low: null, high: null },
    ];
    expect(bestBucket(resting, buckets)?.label).toBe('b');
    expect(bestBucket(resting, [])).toBeNull();
  });
});

describe('daily figures', () => {
  const figures = [
    { day: '2026-10-06', metric: 'resting_heart_rate', value: 56 },
    { day: '2026-10-07', metric: 'resting_heart_rate', value: 54 },
    { day: '2026-10-08', metric: 'resting_heart_rate', value: 60 },
    { day: '2026-10-08', metric: 'steps', value: 900 },
  ];

  it('reads one figure of one day', () => {
    expect(figureOn(figures, '2026-10-08', 'steps')).toBe(900);
    expect(figureOn(figures, '2026-10-07', 'steps')).toBeNull();
  });

  it('a baseline averages only the days before', () => {
    expect(baselineOf(figures, '2026-10-08', 'resting_heart_rate')).toBe(55);
    expect(baselineOf(figures, '2026-10-06', 'resting_heart_rate')).toBeNull();
  });

  it('finds the newest figure up to a day', () => {
    expect(latestFigure(figures, 'resting_heart_rate', '2026-10-07')?.value).toBe(54);
    expect(latestFigure(figures, 'resting_heart_rate', '2026-10-09')?.value).toBe(60);
    expect(latestFigure(figures, 'weight', '2026-10-09')).toBeNull();
  });
});

describe('trend wording', () => {
  it('scales the change into the shown unit and adds the percentage', () => {
    const distance = seriesOf('distance');
    expect(trendWords(distance, trendOf(5500, 5000, 'higher'), true)).toBe(
      '↑ +0.50\u00a0km (+10%)',
    );
    expect(trendWords(distance, trendOf(4000, 5000, 'higher'), false)).toBe('↓ −1.00 (−20%)');
    expect(trendWords(distance, trendOf(1, 0, 'higher'), false)).toBe('→ steady');
    expect(trendWords(distance, trendOf(20, 0, 'higher'), false)).toBe('↑ +0.02');
    expect(trendWords(distance, trendOf(5, 5, 'higher'), false)).toBe('→ steady');
    expect(trendWords(distance, null, false)).toBe('no earlier data');
  });
});

describe('sleep duration points', () => {
  it('reads a staged night as asleep minutes, not time in bed', () => {
    const night = seedRecord({
      type: 'SleepSession',
      start: at(7, 23),
      end: at(8, 7),
      data: {
        title: null,
        notes: null,
        stages: [
          { startTime: at(7, 23).toISOString(), endTime: at(8, 1).toISOString(), stage: 4 },
          { startTime: at(8, 1).toISOString(), endTime: at(8, 2).toISOString(), stage: 1 },
          { startTime: at(8, 2).toISOString(), endTime: at(8, 7).toISOString(), stage: 5 },
        ],
      },
    });
    const points = pointsOfRecords(seriesOfType('SleepSession'), [night]);
    expect(points).toHaveLength(1);
    expect(points[0]?.value).toBe(420);
    expect(points[0]?.at).toBe(at(8, 7).getTime());
  });
});
