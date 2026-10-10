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
import { baselineOf, figureOn, latestFigure, seriesFor } from './daily';
import { pointsOfDaily, pointsOfRecords } from './points';
import { trendWords } from './format';
import { vitalOf } from './vitals';
import { at, seedRecord } from './test-support';
import { windowOf } from './window';

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
    for (const metric of HEALTH_METRICS) {
      expect(covered).toContain(metric);
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
    expect(formatReading(seriesOf('distance'), 5230)).toBe('5.23 km');
    expect(formatReading(seriesOf('height'), 1.82)).toBe('182 cm');
    expect(formatAmount(seriesOf('steps'), 12_400)).toBe('12.4k');
    expect(formatAmount(seriesOf('steps'), 8204)).toBe('8204');
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
    const buckets = bucketise(steps, window, pointsOfRecords(steps, records));
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

  it('summarises a period as a daily average with the total beside it', () => {
    const summary = summarise(
      steps,
      windowOf('week', '2026-10-08'),
      pointsOfRecords(steps, records),
    );
    expect(summary.total).toBe(9000);
    expect(summary.headline).toBe(4500);
    expect(summary.daysWithData).toBe(2);
    expect(summary.count).toBe(3);
  });

  it('a single day headline is the day total', () => {
    const summary = summarise(
      steps,
      windowOf('day', '2026-10-06'),
      pointsOfRecords(steps, records),
    );
    expect(summary.headline).toBe(5000);
  });

  it('an empty period has no figures', () => {
    const summary = summarise(
      steps,
      windowOf('day', '2026-10-01'),
      pointsOfRecords(steps, records),
    );
    expect(summary).toEqual({
      headline: null,
      total: null,
      low: null,
      high: null,
      latest: null,
      daysWithData: 0,
      count: 0,
    });
  });

  it('latest measures report the newest reading', () => {
    const weight = seriesOf('weight');
    const points = pointsOfRecords(weight, [
      seedRecord({ type: 'Weight', start: at(3, 7), data: { kilograms: 81 } }),
      seedRecord({ type: 'Weight', start: at(5, 7), data: { kilograms: 79.5 } }),
    ]);
    const summary = summarise(weight, windowOf('week', '2026-10-05'), points);
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

  it('year buckets average summed measures per day with data', () => {
    const points = pointsOfDaily(steps, [
      { day: '2026-10-01', metric: 'steps', value: 6000 },
      { day: '2026-10-02', metric: 'steps', value: 10_000 },
    ]);
    const buckets = bucketise(steps, windowOf('year', '2026-10-08'), points);
    expect(buckets[9]?.value).toBe(8000);
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

  it('lines a metric up against a list of days', () => {
    expect(seriesFor(figures, 'resting_heart_rate', ['2026-10-05', '2026-10-06'])).toEqual([
      null,
      56,
    ]);
  });
});

describe('trend wording', () => {
  it('scales the change into the shown unit and adds the percentage', () => {
    const distance = seriesOf('distance');
    expect(trendWords(distance, trendOf(5500, 5000, 'higher'), true)).toBe('↑ +0.50 km (+10%)');
    expect(trendWords(distance, trendOf(4000, 5000, 'higher'), false)).toBe('↓ −1.00 (−20%)');
    expect(trendWords(distance, trendOf(1, 0, 'higher'), false)).toBe('→ steady');
    expect(trendWords(distance, trendOf(20, 0, 'higher'), false)).toBe('↑ +0.02');
    expect(trendWords(distance, trendOf(5, 5, 'higher'), false)).toBe('→ steady');
    expect(trendWords(distance, null, false)).toBe('no earlier data');
  });
});

describe('vital readings', () => {
  const resting = seriesOf('resting_heart_rate');
  const figures = [
    { day: '2026-10-05', metric: 'resting_heart_rate', value: 56 },
    { day: '2026-10-06', metric: 'resting_heart_rate', value: 54 },
    { day: '2026-10-07', metric: 'resting_heart_rate', value: 52 },
  ];

  it('reads the newest value, its trend against earlier days and a sparkline', () => {
    const reading = vitalOf(resting, figures, '2026-10-08', 3);
    expect(reading.value).toBe(52);
    expect(reading.spark).toEqual([54, 52]);
    expect(reading.trend).toMatchObject({ delta: -3, good: true });
    expect(reading.when).toBe('Yesterday');
    expect(vitalOf(resting, figures, '2026-10-07', 3).when).toBe('today');
  });

  it('says when nothing was synced', () => {
    expect(vitalOf(resting, [], '2026-10-08', 3)).toEqual({
      value: null,
      spark: [],
      trend: null,
      when: 'not synced yet',
    });
  });
});
