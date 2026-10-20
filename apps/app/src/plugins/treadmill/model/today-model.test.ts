import { TREADMILL_GOALS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ringSentence, streakLine, todayRings, type StatsView } from './today-model';

function statsView(goals: Partial<StatsView['goals']> = {}): StatsView {
  return {
    view: 'stats',
    profileId: null,
    stats: {
      range: 'week',
      from: '2026-10-12',
      to: '2026-10-18',
      buckets: [],
      previousBuckets: [],
      totals: {
        sessions: 0,
        activeSeconds: 0,
        distanceM: 0,
        steps: 0,
        kcal: 0,
        climbM: 0,
        activeDays: 0,
      },
      previous: {
        sessions: 0,
        activeSeconds: 0,
        distanceM: 0,
        steps: 0,
        kcal: 0,
        climbM: 0,
        activeDays: 0,
      },
      delta: {
        sessions: null,
        activeSeconds: null,
        distanceM: null,
        steps: null,
        kcal: null,
        climbM: null,
      },
      average7: [],
      average30: [],
      incline: { avg: null, max: null, seconds: {} },
      perSession: { distanceM: 0, activeSeconds: 0, avgKmh: 0, steps: 0, kcal: 0, climbM: 0 },
      bests: {
        longestDistanceM: null,
        longestSeconds: null,
        fastestAvgKmh: null,
        topSpeedKmh: null,
        mostSteps: null,
        mostClimbM: null,
      },
      streak: { current: 0, longest: 0 },
      heatmap: [],
      zones: { walk: 0, jog: 0, run: 0 },
      efficiency: [],
    },
    goals: { ...TREADMILL_GOALS.parse({}), ...goals },
    today: { activeSeconds: 900, distanceM: 1200, steps: 1800, kcal: 60, sessions: 1 },
    week: { distanceM: 10000, sessions: 3 },
  };
}

describe('the goal rings of today and this week', () => {
  it('shares minutes, distance and sessions against the default goals', () => {
    const rings = todayRings(statsView());
    expect(rings.map((entry) => entry.key)).toEqual(['minutes', 'distance', 'sessions']);
    expect(rings[0]).toMatchObject({ progress: 0.5, done: '15 min', goal: '30 min' });
    expect(rings[1]).toMatchObject({ progress: 0.5, done: '10.0 km', goal: '20.0 km' });
    expect(rings[2]).toMatchObject({ progress: 0.6, done: '3', goal: '5' });
  });

  it('adds a ring for steps and for energy only when the person set that goal', () => {
    const rings = todayRings(statsView({ dailySteps: 3000, dailyKcal: 200 }));
    expect(rings.map((entry) => entry.key)).toEqual([
      'minutes',
      'distance',
      'sessions',
      'steps',
      'kcal',
    ]);
    expect(rings[3]?.progress).toBe(0.6);
    expect(rings[4]).toMatchObject({ progress: 0.3, done: '60 kcal', goal: '200 kcal' });
  });

  it('reads one ring out in words', () => {
    const [first] = todayRings(statsView());
    expect(first && ringSentence(first)).toBe('Minutes today, 15 min of 30 min');
  });

  it('writes the streak', () => {
    expect(streakLine({ current: 0, longest: 0 })).toBe('No streak yet');
    expect(streakLine({ current: 0, longest: 6 })).toBe('Best streak 6 days');
    expect(streakLine({ current: 1, longest: 6 })).toBe('1 day in a row · best 6');
    expect(streakLine({ current: 4, longest: 6 })).toBe('4 days in a row · best 6');
  });
});
