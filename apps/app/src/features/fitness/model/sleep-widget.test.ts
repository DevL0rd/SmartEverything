import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { nightOf } from './sleep';
import {
  goalFiguresOf,
  legendRowsOf,
  napFaceOf,
  NO_STAGES_NOTE,
  timesLineOf,
} from './sleep-widget';
import { at, seedRecord } from './test-support';

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function night(start: Date, end: Date, stages: readonly object[]): ReturnType<typeof nightOf> {
  const [record] = recordsOfType(
    [seedRecord({ type: 'SleepSession', start, end, data: { title: null, notes: null, stages } })],
    'SleepSession',
  );
  return nightOf(record!);
}

const STAGED = night(at(7, 23), at(8, 7), [
  stage(at(7, 23), at(8, 1), 4),
  stage(at(8, 1), at(8, 2, 30), 5),
  stage(at(8, 2, 30), at(8, 3), 1),
  stage(at(8, 3), at(8, 5), 6),
  stage(at(8, 5), at(8, 7), 4),
]);

const UNSTAGED = night(at(7, 23), at(8, 7), []);

function nap(start: Date, end: Date, awake: Date): ReturnType<typeof nightOf> {
  return night(start, end, [stage(start, awake, 1), stage(awake, end, 4)]);
}

describe('sleep widget legend', () => {
  it('lists the four stages in summary order with minutes and percent', () => {
    expect(legendRowsOf(STAGED)).toEqual([
      { stage: 'deep', label: 'Deep', minutes: '1h 30m', percent: '20%' },
      { stage: 'light', label: 'Light', minutes: '4h 00m', percent: '53%' },
      { stage: 'rem', label: 'REM', minutes: '2h 00m', percent: '27%' },
      { stage: 'awake', label: 'Awake', minutes: '30m', percent: '6%' },
    ]);
  });

  it('has no stage rows for a night without stages and names why', () => {
    expect(legendRowsOf(UNSTAGED)).toEqual([]);
    expect(NO_STAGES_NOTE).toBe('Stages not recorded · Based on duration only');
  });
});

describe('sleep widget figures', () => {
  it('writes the goal as a rounded-down percent in the short and long form', () => {
    const figures = goalFiguresOf(STAGED, 450);
    expect(figures.progress).toBe(1);
    expect(figures.short).toBe('100%');
    expect(figures.long).toBe('Goal 7h 30m · 100%');
    const under = goalFiguresOf(STAGED, 540);
    expect(under.short).toBe('83%');
    expect(under.progress).toBe(0.83);
    expect(under.long).toBe('Goal 9h · 83%');
  });

  it('writes the bed and wake line', () => {
    expect(timesLineOf(STAGED)).toBe('11:00 PM – 7:00 AM');
  });
});

describe('sleep widget nap face', () => {
  it('is empty without naps', () => {
    expect(napFaceOf([])).toBeNull();
  });

  it('describes the longest nap with its bar and legend', () => {
    const short = nap(at(8, 10, 30), at(8, 10, 50), at(8, 10, 35));
    const long = nap(at(8, 14, 0), at(8, 14, 38), at(8, 14, 5));
    const face = napFaceOf([short, long]);
    expect(face?.headline).toBe('Nap · 33m');
    expect(face?.times).toBe('2:00 PM – 2:38 PM');
    expect(face?.start).toBe('2:00 PM');
    expect(face?.end).toBe('2:38 PM');
    expect(face?.legend.map((entry) => entry.text)).toEqual(['Awake 5m', 'Light 33m']);
    expect(face?.pieces.map((piece) => piece.stage)).toEqual(['awake', 'light']);
  });
});
