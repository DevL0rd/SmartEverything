import { PHONE_SCREEN_TIMEOUTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  TIMEOUT_OPTIONS,
  againstAverage,
  averageBefore,
  foldText,
  timeoutValueOf,
  todayKey,
  weekBars,
  weekSpoken,
  type ScreenSection,
} from './screen-model';

type Usage = NonNullable<ScreenSection['usage']>;

function usage(minutes: readonly number[]): Usage {
  return {
    unlocksToday: 12,
    screenMinutesByDay: minutes.map((value, index) => ({
      day: `2026-10-${String(12 + index).padStart(2, '0')}`,
      minutes: value,
    })),
  };
}

describe('the screen timeout choices', () => {
  it('offers exactly the timeouts the domain allows, in order, with readable labels', () => {
    expect(TIMEOUT_OPTIONS.map((option) => Number(option.value))).toEqual([
      ...PHONE_SCREEN_TIMEOUTS,
    ]);
    expect(TIMEOUT_OPTIONS.map((option) => option.label)).toEqual([
      '15 s',
      '30 s',
      '1 min',
      '2 min',
      '5 min',
      '10 min',
      '30 min',
    ]);
  });

  it('selects nothing for a timeout the phone reports but the app cannot set', () => {
    expect(timeoutValueOf(45)).toBe('45');
    expect(TIMEOUT_OPTIONS.some((option) => option.value === timeoutValueOf(45))).toBe(false);
    expect(timeoutValueOf(null)).toBe('');
  });
});

describe('screen time over the week', () => {
  const week = usage([60, 120, 90, 30, 200, 100, 150]);

  it('draws one bar per day labelled with the weekday and highlights today', () => {
    const bars = weekBars(week);
    expect(bars).toHaveLength(7);
    expect(bars.map((bar) => bar.value)).toEqual([60, 120, 90, 30, 200, 100, 150]);
    expect(todayKey(week)).toBe('2026-10-18');
    expect(bars.at(-1)?.key).toBe('2026-10-18');
  });

  it('has no bars when the phone shares no usage', () => {
    expect(weekBars(null)).toEqual([]);
  });

  it('averages the days before today', () => {
    expect(averageBefore(week)).toBeCloseTo(100, 5);
    expect(averageBefore(usage([10]))).toBeNull();
  });

  it('compares today against that average in words', () => {
    expect(againstAverage(80, 100, 'your')).toBe('20 % less than your average');
    expect(againstAverage(150, 100, 'Sam’s')).toBe('50 % more than Sam’s average');
    expect(againstAverage(102, 100, 'your')).toBe('About your average');
    expect(againstAverage(50, 0, 'your')).toBeNull();
    expect(againstAverage(50, null, 'your')).toBeNull();
  });

  it('speaks every day for a screen reader', () => {
    expect(weekSpoken(week)).toContain('Sun 2h 30m');
    expect(weekSpoken(week).startsWith('Screen time, last 7 days:')).toBe(true);
  });
});

describe('the fold state', () => {
  it('names the two states and nothing for a phone that does not fold', () => {
    expect(foldText('open')).toBe('Open');
    expect(foldText('folded')).toBe('Folded');
    expect(foldText(null)).toBeNull();
  });
});
