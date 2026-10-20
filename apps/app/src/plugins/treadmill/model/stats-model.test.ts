import { computeStats, type TreadmillSession } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  averageLinesOf,
  bucketLabel,
  deltaText,
  deltaTone,
  heatCells,
  heatSummary,
  kilometresText,
  landmarkLine,
  metricOf,
  minutesText,
} from './stats-model';

describe('axis labels', () => {
  it('names the weekday of a day, counting from Monday', () => {
    expect(bucketLabel('week', '2026-10-19')).toBe('M');
    expect(bucketLabel('week', '2026-10-24')).toBe('S');
  });

  it('thins the labels of a month, a day and keeps the months of a year', () => {
    expect(bucketLabel('month', '2026-10-01')).toBe('1');
    expect(bucketLabel('month', '2026-10-05')).toBe('5');
    expect(bucketLabel('month', '2026-10-06')).toBe('');
    expect(bucketLabel('day', '2026-10-18T06')).toBe('6');
    expect(bucketLabel('day', '2026-10-18T07')).toBe('');
    expect(bucketLabel('year', '2026-10')).toBe('O');
  });
});

describe('figures', () => {
  it('reads a bucket in kilometres, minutes, steps and kilocalories', () => {
    const bucket = {
      key: 'k',
      sessions: 1,
      activeSeconds: 600,
      distanceM: 2500,
      steps: 3000,
      kcal: 120,
      climbM: 0,
    };
    expect(metricOf(bucket, 'distance')).toBe(2.5);
    expect(metricOf(bucket, 'time')).toBe(10);
    expect(metricOf(bucket, 'steps')).toBe(3000);
    expect(metricOf(bucket, 'kcal')).toBe(120);
  });

  it('writes a change against the last period', () => {
    expect(deltaText(12.4)).toBe('+12%');
    expect(deltaText(-8.6)).toBe('−9%');
    expect(deltaText(0.2)).toBe('Same');
    expect(deltaText(null)).toBe('New');
    expect(deltaTone(5)).toBe('positive');
    expect(deltaTone(-5)).toBe('critical');
    expect(deltaTone(0.1)).toBe('neutral');
    expect(deltaTone(null)).toBe('neutral');
  });

  it('writes minutes and kilometres', () => {
    expect(minutesText(1500)).toBe('25 min');
    expect(minutesText(4500)).toBe('1 h 15 min');
    expect(kilometresText(2345)).toBe('2.3 km');
    expect(kilometresText(250000)).toBe('250 km');
  });
});

describe('the activity calendar', () => {
  it('lays the last weeks out Monday first and ends on today', () => {
    const cells = heatCells(
      [
        { day: '2026-10-18', distanceM: 3000, level: 3 },
        { day: '2026-10-12', distanceM: 1000, level: 1 },
      ],
      2,
      '2026-10-18',
    );
    expect(cells).toHaveLength(7 + 7);
    const last = cells[cells.length - 1];
    expect(last).toMatchObject({ day: '2026-10-18', level: 3, column: 1, row: 6 });
    expect(cells[0]).toMatchObject({ day: '2026-10-05', column: 0, row: 0, level: 0 });
    expect(heatSummary(cells)).toBe('2 active days, 4.0 km');
  });

  it('leaves out the days after today', () => {
    const cells = heatCells([], 1, '2026-10-14');
    expect(cells.map((cell) => cell.day)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('average lines', () => {
  const session: TreadmillSession = {
    id: 's1',
    deviceId: 'd1',
    walkerProfileId: null,
    startedAt: '2026-10-14T07:00:00+00:00',
    endedAt: '2026-10-14T07:40:00+00:00',
    zoneOffsetSeconds: 0,
    activeSeconds: 2400,
    pausedSeconds: 0,
    distanceM: 7000,
    steps: 4000,
    kcal: 200,
    kcalNet: 120,
    avgKmh: 10.5,
    maxKmh: 11,
    mode: null,
    kind: 'run',
    zones: { walk: 0, jog: 0, run: 2400 },
    splits: [],
    source: 'live',
    climbM: null,
    inclineAvg: null,
    inclineMax: null,
    inclineSeconds: {},
    kcalSource: null,
    kcalEstimate: null,
    heartRateSource: null,
  };
  const stats = computeStats({
    sessions: [session],
    range: 'week',
    anchor: '2026-10-14',
    today: '2026-10-14',
  });

  it('draws the averages in kilometres, the unit of the distance bars', () => {
    const lines = averageLinesOf('week', stats, 'distance');
    expect(lines?.short).toHaveLength(stats.buckets.length);
    expect(Math.max(...(lines?.short ?? []))).toBeCloseTo(1);
    expect(Math.max(...(lines?.long ?? []))).toBeCloseTo(7 / 30);
  });

  it('draws no average lines for the measures they do not describe', () => {
    expect(averageLinesOf('week', stats, 'time')).toBeNull();
    expect(averageLinesOf('week', stats, 'steps')).toBeNull();
    expect(averageLinesOf('year', stats, 'distance')).toBeNull();
  });
});

describe('climb in the statistics', () => {
  it('reads the climb of a bucket in metres', () => {
    const bucket = {
      key: '2026-10-18',
      sessions: 1,
      activeSeconds: 600,
      distanceM: 900,
      steps: 1000,
      kcal: 50,
      climbM: 42,
    };
    expect(metricOf(bucket, 'climb')).toBe(42);
  });

  it('names a landmark only above 300 metres', () => {
    expect(landmarkLine(300)).toBeNull();
    expect(landmarkLine(330.5)).toBe('About as high as the Eiffel Tower');
    expect(landmarkLine(990)).toBe('As high as 3.0 Eiffel Towers');
  });
});
