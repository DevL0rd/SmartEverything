import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { readiness, readinessWord, sleepScore } from './scores';
import {
  median,
  nightOf,
  patternOf,
  scheduleMarks,
  scheduleShare,
  sleepDaysOf,
  stageKindOf,
} from './sleep';
import { at, seedRecord } from './test-support';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function session(day: number, stages: readonly object[]): ReturnType<typeof seedRecord> {
  return seedRecord({
    type: 'SleepSession',
    start: at(day - 1, 23),
    end: at(day, 7),
    data: { title: null, notes: null, stages },
  });
}

const STAGED = session(8, [
  stage(at(7, 23), at(8, 1), 4),
  stage(at(8, 1), at(8, 2, 30), 5),
  stage(at(8, 2, 30), at(8, 3), 1),
  stage(at(8, 3), at(8, 5), 6),
  stage(at(8, 5), at(8, 7), 4),
]);

describe('sleep nights', () => {
  it('maps Health Connect stage codes onto stage kinds', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 99].map(stageKindOf)).toEqual([
      'unknown',
      'awake',
      'asleep',
      'awake',
      'light',
      'deep',
      'rem',
      'awake',
      'unknown',
    ]);
  });

  it('totals each stage and counts awake time out of sleep', () => {
    const [record] = recordsOfType([STAGED], 'SleepSession');
    const night = nightOf(record!);
    expect(night.day).toBe('2026-10-08');
    expect(night.inBedMinutes).toBe(480);
    expect(night.totals).toEqual({
      awake: 30,
      rem: 120,
      light: 240,
      deep: 90,
      asleep: 0,
      unknown: 0,
    });
    expect(night.asleepMinutes).toBe(450);
    expect(night.efficiency).toBeCloseTo(450 / 480);
    expect(night.hasStages).toBe(true);
  });

  it('a session without stages counts the whole session as sleep', () => {
    const [record] = recordsOfType([session(8, [])], 'SleepSession');
    const night = nightOf(record!);
    expect(night.asleepMinutes).toBe(480);
    expect(night.efficiency).toBeNull();
    expect(night.stages).toEqual([{ kind: 'asleep', start: night.bedtime, end: night.wake }]);
  });

  it('groups sessions by the day they end and keeps the longest as the main night', () => {
    const nap = seedRecord({
      type: 'SleepSession',
      start: at(8, 14),
      end: at(8, 14, 30),
      data: { title: 'Nap', notes: null, stages: [] },
    });
    const days = sleepDaysOf(recordsOfType([nap, STAGED, session(7, [])], 'SleepSession'));
    expect(days.map((day) => day.day)).toEqual(['2026-10-07', '2026-10-08']);
    expect(days[1]?.naps.map((night) => night.title)).toEqual(['Nap']);
    expect(days[1]?.asleepMinutes).toBe(480);
  });

  it('median is the middle value, or the mean of the two middle values', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(() => median([])).toThrow('The median of an empty list of values is undefined.');
  });

  it('patterns measure the usual times and how regular they are', () => {
    const late = seedRecord({
      type: 'SleepSession',
      start: at(9, 1),
      end: at(9, 9),
      data: { title: null, notes: null, stages: [] },
    });
    const days = sleepDaysOf(recordsOfType([session(7, []), session(8, []), late], 'SleepSession'));
    const pattern = patternOf(days);
    expect(pattern?.usualBedtime).toBe(23 * 60);
    expect(pattern?.usualWake).toBe(7 * 60);
    expect(pattern?.regularity).toBeCloseTo(2 / 3);
    expect(pattern?.averageAsleep).toBe(480);
    expect(patternOf([])).toBeNull();
  });
});

describe('the sleep schedule axis', () => {
  it('runs from 18:00 the evening before to 14:00 on the day', () => {
    expect(scheduleShare('2026-10-08', at(7, 18).getTime())).toBe(0);
    expect(scheduleShare('2026-10-08', at(8, 4).getTime())).toBe(0.5);
    expect(scheduleShare('2026-10-08', at(8, 14).getTime())).toBe(1);
    expect(scheduleShare('2026-10-08', at(8, 20).getTime())).toBe(1);
    expect(scheduleShare('2026-10-08', at(7, 12).getTime())).toBe(0);
    expect(scheduleMarks()).toEqual(['18:00', '22:00', '02:00', '06:00', '10:00', '14:00']);
  });
});

describe('sleep and readiness scores', () => {
  it('scores duration, restorative sleep and efficiency with explanations', () => {
    const [record] = recordsOfType([STAGED], 'SleepSession');
    const score = sleepScore(nightOf(record!), 480);
    expect(score?.parts.map((part) => part.key)).toEqual(['duration', 'restorative', 'efficiency']);
    expect(score?.value).toBe(Math.round((50 * (450 / 480) * 100 + 25 * 100 + 25 * 100) / 100));
  });

  it('scores only duration when there are no stages', () => {
    const [record] = recordsOfType([session(8, [])], 'SleepSession');
    expect(sleepScore(nightOf(record!), 480)?.value).toBe(100);
  });

  it('readiness weighs only the parts it has', () => {
    expect(
      readiness({
        sleep: null,
        hrv: null,
        hrvBaseline: null,
        restingHeartRate: null,
        restingBaseline: null,
        load: null,
        loadBaseline: null,
      }),
    ).toBeNull();
    const steady = readiness({
      sleep: { value: 75, parts: [] },
      hrv: 60,
      hrvBaseline: 60,
      restingHeartRate: 55,
      restingBaseline: 55,
      load: 400,
      loadBaseline: 400,
    });
    expect(steady?.parts.map((part) => part.key)).toEqual(['sleep', 'hrv', 'resting', 'load']);
    expect(steady?.value).toBe(Math.round((35 * 75 + 25 * 75 + 25 * 75 + 15 * 100) / 100));
  });

  it('a lower HRV and a higher resting heart rate lower readiness', () => {
    const tired = readiness({
      sleep: null,
      hrv: 48,
      hrvBaseline: 60,
      restingHeartRate: 60,
      restingBaseline: 55,
      load: 900,
      loadBaseline: 450,
    });
    expect(tired?.parts.map((part) => Math.round(part.score))).toEqual([25, 35, 0]);
    expect(readinessWord(85)).toBe('Ready');
    expect(readinessWord(65)).toBe('Steady');
    expect(readinessWord(40)).toBe('Take it easy');
  });
});
