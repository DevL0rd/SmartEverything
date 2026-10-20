import { describe, expect, it } from 'vitest';
import { oralbViewOf, viewOf } from './fixtures';
import {
  scoreRows,
  scoreWord,
  streakLine,
  streakShort,
  todayLine,
  todayRings,
} from './today-model';

const TODAY = viewOf().today;

describe('the rings for today', () => {
  it('fills the brushes ring and the time ring from the goal', () => {
    if (TODAY === null) {
      throw new Error('the fixture has a day');
    }
    const rings = todayRings(TODAY);
    expect(rings.map((ring) => ring.progress)).toEqual([0.5, 0.5]);
    expect(rings[0]?.label).toBe('Brushes 1 of 2');
    expect(rings[1]?.label).toBe('Time 2:00 of 4:00');
  });

  it('shows empty rings rather than dividing by a goal of zero', () => {
    if (TODAY === null) {
      throw new Error('the fixture has a day');
    }
    expect(todayRings({ ...TODAY, goalSeconds: 0 })[1]?.progress).toBe(0);
  });
});

describe('the sentence about today', () => {
  it('counts the brushes still to do and announces a reached goal', () => {
    if (TODAY === null) {
      throw new Error('the fixture has a day');
    }
    expect(todayLine(TODAY)).toBe('1 more brush to reach today’s goal');
    expect(todayLine({ ...TODAY, counted: 0 })).toBe('2 more brushes to reach today’s goal');
    expect(todayLine({ ...TODAY, counted: 2 })).toBe('Goal reached today');
  });
});

describe('the streak', () => {
  it('describes a running streak, the best one and a broken one', () => {
    expect(streakLine(3, 3)).toBe('3 days in a row, your best');
    expect(streakLine(3, 9)).toBe('3 days in a row, best 9');
    expect(streakLine(0, 4)).toBe('Streak ended. Best was 4 days');
    expect(streakLine(0, 1)).toBe('Streak ended. Best was 1 day');
    expect(streakLine(0, 0)).toBe('No streak yet');
    expect(streakShort(1)).toBe('1 day in a row');
    expect(streakShort(0)).toBe('No streak yet');
  });
});

describe('the score', () => {
  it('words the score', () => {
    expect(scoreWord(null)).toBe('No score yet');
    expect(scoreWord(90)).toBe('Excellent');
    expect(scoreWord(70)).toBe('Good');
    expect(scoreWord(30)).toBe('Room to improve');
  });

  it('lists the three parts with their weights', () => {
    const rows = scoreRows({
      goalRate: 0.8,
      completionRate: 0.9,
      pressureRate: null,
      score: 70,
    });
    expect(rows.map((row) => [row.label, row.weight, row.rate])).toEqual([
      ['Goal days', 50, 0.8],
      ['Whole routines', 30, 0.9],
      ['Gentle pressure', 20, null],
    ]);
  });
});

describe('today for an Oral-B brush', () => {
  it('uses the same rings and words as any brush', () => {
    const today = oralbViewOf().today;
    if (today === null) {
      throw new Error('the fixture has a day');
    }
    expect(todayRings(today).map((ring) => ring.progress)).toEqual([0.5, 0.5]);
  });
});
