import { describe, expect, it } from 'vitest';
import {
  TREADMILL_SESSION,
  TREADMILL_SETTINGS,
  climbOf,
  gradeOf,
  inclineSummaryOf,
  inclineVerdict,
  type InclineCaller,
  type InclineSample,
} from '../src';

const RANGE = { inclineMinPercent: 0, inclineMaxPercent: 20, inclineStepPercent: 1 };
const POLICY = { remoteIncline: false, remoteInclineMax: 5 };
const WALKING: InclineCaller = {
  owner: true,
  walker: true,
  remote: false,
  held: false,
  stepsSeen: true,
};

function sample(t: number, distanceM: number, incline: number | null): InclineSample {
  return { t, distanceM, incline, state: 'running' };
}

describe('grade of the belt reading', () => {
  it('reads levels at half a percent and percent as is', () => {
    expect(gradeOf(10, 'levels')).toBe(5);
    expect(gradeOf(10, 'unconfirmed')).toBe(5);
    expect(gradeOf(10, 'percent')).toBe(10);
    expect(gradeOf(null, 'percent')).toBe(0);
    expect(gradeOf(-1, 'percent')).toBe(0);
  });
});

describe('climb', () => {
  const samples = [
    sample(0, 0, 4),
    sample(60, 100, 10),
    sample(120, 300, null),
    sample(180, 350, 8),
  ];

  it('sums distance moved times positive grade', () => {
    expect(climbOf(samples, 'percent')).toBeCloseTo(4 + 20, 6);
    expect(climbOf(samples, 'unconfirmed')).toBeCloseTo(2 + 10, 6);
  });

  it('counts nothing without movement', () => {
    expect(climbOf([sample(0, 50, 10), sample(30, 50, 10)], 'percent')).toBe(0);
  });
});

describe('incline summary', () => {
  it('weights average, maximum and time at each incline by seconds', () => {
    const summary = inclineSummaryOf([
      sample(0, 0, 2),
      sample(30, 10, 6),
      sample(90, 30, 6),
      { t: 120, distanceM: 30, incline: 9, state: 'paused' },
      sample(150, 30, 9),
    ]);
    expect(summary.seconds).toStrictEqual({ '2': 30, '6': 90 });
    expect(summary.avg).toBeCloseTo((2 * 30 + 6 * 90) / 120, 6);
    expect(summary.max).toBe(6);
  });
});

describe('incline verdict', () => {
  it('moves one step toward the snapped target', () => {
    expect(inclineVerdict({ target: 7.2, current: 3 }, RANGE, POLICY, WALKING)).toStrictEqual({
      allowed: true,
      step: 4,
      final: 7,
    });
    expect(inclineVerdict({ target: 0, current: 3 }, RANGE, POLICY, WALKING)).toMatchObject({
      allowed: true,
      step: 2,
    });
  });

  it('refuses outside the range, no range, unread and no change', () => {
    expect(inclineVerdict({ target: 21, current: 3 }, RANGE, POLICY, WALKING)).toMatchObject({
      allowed: false,
    });
    expect(inclineVerdict({ target: -1, current: 3 }, RANGE, POLICY, WALKING)).toMatchObject({
      allowed: false,
    });
    const noRange = { ...RANGE, inclineStepPercent: null };
    expect(inclineVerdict({ target: 4, current: 3 }, noRange, POLICY, WALKING)).toMatchObject({
      allowed: false,
    });
    expect(inclineVerdict({ target: 4, current: null }, RANGE, POLICY, WALKING)).toMatchObject({
      allowed: false,
    });
    expect(inclineVerdict({ target: 3.2, current: 3 }, RANGE, POLICY, WALKING)).toMatchObject({
      allowed: false,
    });
  });

  it('allows only the owner or the walker', () => {
    const other = { ...WALKING, owner: false, walker: false };
    expect(inclineVerdict({ target: 4, current: 3 }, RANGE, POLICY, other)).toMatchObject({
      allowed: false,
    });
    const walker = { ...WALKING, owner: false };
    expect(inclineVerdict({ target: 4, current: 3 }, RANGE, POLICY, walker).allowed).toBe(true);
  });

  it('keeps remote incline off by default and capped when on', () => {
    const remote = { ...WALKING, remote: true };
    expect(inclineVerdict({ target: 4, current: 3 }, RANGE, POLICY, remote)).toMatchObject({
      allowed: false,
    });
    const on = { remoteIncline: true, remoteInclineMax: 5 };
    expect(inclineVerdict({ target: 5, current: 4 }, RANGE, on, remote).allowed).toBe(true);
    expect(inclineVerdict({ target: 6, current: 5 }, RANGE, on, remote)).toMatchObject({
      allowed: false,
    });
    expect(inclineVerdict({ target: 2, current: 9 }, RANGE, on, remote).allowed).toBe(true);
  });

  it('needs steps, or a hold on the holder phone', () => {
    const idle = { ...WALKING, stepsSeen: false };
    expect(inclineVerdict({ target: 4, current: 3 }, RANGE, POLICY, idle)).toMatchObject({
      allowed: false,
    });
    expect(
      inclineVerdict({ target: 4, current: 3 }, RANGE, POLICY, { ...idle, held: true }).allowed,
    ).toBe(true);
    const on = { remoteIncline: true, remoteInclineMax: 5 };
    expect(
      inclineVerdict({ target: 4, current: 3 }, RANGE, on, { ...idle, held: true, remote: true }),
    ).toMatchObject({ allowed: false });
  });
});

describe('old rows', () => {
  it('parse settings without the incline fields and default them', () => {
    const settings = TREADMILL_SETTINGS.parse({ policy: { remoteStart: true } });
    expect(settings.inclineScale).toBe('unconfirmed');
    expect(settings.policy.remoteIncline).toBe(false);
    expect(settings.policy.remoteInclineMax).toBe(5);
  });

  it('parse a session without the incline fields', () => {
    const session = TREADMILL_SESSION.parse({
      id: 'a',
      deviceId: 'd',
      walkerProfileId: null,
      startedAt: '2026-10-18T10:00:00Z',
      endedAt: '2026-10-18T10:30:00Z',
      zoneOffsetSeconds: 0,
      activeSeconds: 1800,
      pausedSeconds: 0,
      distanceM: 3000,
      steps: null,
      kcal: null,
      kcalNet: null,
      avgKmh: 6,
      maxKmh: 6,
      mode: null,
      kind: 'walk',
      zones: { walk: 1800, jog: 0, run: 0 },
      splits: [],
      source: 'live',
    });
    expect(session.climbM).toBeNull();
    expect(session.inclineSeconds).toStrictEqual({});
  });
});
