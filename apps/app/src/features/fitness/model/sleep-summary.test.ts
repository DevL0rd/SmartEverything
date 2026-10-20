import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { sleepScore } from './scores';
import { nightOf, type SleepNight } from './sleep';
import {
  asleepHeadline,
  nightSummaryOf,
  scorePartRowsOf,
  scoreWordOf,
  stageRowsOf,
} from './sleep-summary';
import { at, seedRecord } from './test-support';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function nightWith(stages: readonly object[]): SleepNight {
  const [record] = recordsOfType(
    [
      seedRecord({
        type: 'SleepSession',
        start: at(7, 23),
        end: at(8, 7),
        data: { title: null, notes: null, stages },
      }),
    ],
    'SleepSession',
  );
  return nightOf(record!);
}

const STAGED = nightWith([
  stage(at(7, 23), at(8, 1), 4),
  stage(at(8, 1), at(8, 2, 30), 5),
  stage(at(8, 2, 30), at(8, 3), 1),
  stage(at(8, 3), at(8, 5), 6),
  stage(at(8, 5), at(8, 7), 4),
]);

describe('stage rows', () => {
  it('lists deep, light, REM and awake with minutes, shares and typical ranges', () => {
    const rows = stageRowsOf(STAGED);
    expect(rows.map((row) => [row.stage, row.minutes, row.percent])).toEqual([
      ['deep', 90, 20],
      ['light', 240, 53],
      ['rem', 120, 27],
      ['awake', 30, 6],
    ]);
    expect(rows.map((row) => row.typical.caption)).toEqual([
      'Typical 13–23%',
      'Typical 50–60%',
      'Typical 20–25%',
      'Typical under 10%',
    ]);
    expect(rows.map((row) => row.within)).toEqual([true, true, false, true]);
    expect(rows[0]?.share).toBeCloseTo(90 / 450);
    expect(rows[3]?.share).toBeCloseTo(30 / 480);
  });

  it('has no rows for a night without stages', () => {
    expect(stageRowsOf(nightWith([]))).toEqual([]);
  });
});

describe('score words and parts', () => {
  it('names the score by its band', () => {
    expect([100, 85, 84, 70, 69, 50, 49, 0].map(scoreWordOf)).toEqual([
      'Great',
      'Great',
      'Good',
      'Good',
      'Fair',
      'Fair',
      'Poor',
      'Poor',
    ]);
  });

  it('turns the score parts into rows with points', () => {
    const score = sleepScore(STAGED, 480);
    const rows = scorePartRowsOf(STAGED, score!);
    expect(rows.map((row) => row.label)).toEqual(['Duration', 'Deep and REM', 'Efficiency']);
    expect(rows.map((row) => row.detail)).toEqual([
      '7h 30m of 8h',
      '47% of sleep',
      '94% of time in bed',
    ]);
    expect(rows.map((row) => row.points)).toEqual([
      'counts for 50 points',
      'counts for 25 points',
      'counts for 25 points',
    ]);
    expect(rows[0]?.fraction).toBeCloseTo(0.9375);
  });
});

describe('night text', () => {
  it('reads the night for a screen reader with the times awake and the longest wake', () => {
    const text = nightSummaryOf(STAGED);
    expect(text).toContain('Sleep stages, ');
    expect(text).toContain('1 time awake, longest 30 minutes.');
    expect(text).toContain('Deep 1h 30m, Light 4h 00m, REM 2h 00m, Awake 30m.');
  });

  it('says stages were not recorded for a night without them', () => {
    expect(nightSummaryOf(nightWith([]))).toContain('Stages were not recorded.');
  });

  it('writes the headline', () => {
    expect(asleepHeadline(STAGED)).toBe('7h 30m asleep');
  });
});
