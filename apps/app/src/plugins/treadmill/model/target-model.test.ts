import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NO_TARGET, targetProgress, targetUnit, zoneBand } from './target-model';

function frame(over: Partial<TreadmillLiveFrame> = {}): TreadmillLiveFrame {
  return {
    at: '2026-10-18T10:00:00.000Z',
    belt: {
      state: 'running',
      mode: 'manual',
      speedKmh: 4.5,
      targetSpeedKmh: null,
      timeS: 600,
      distanceM: 1500,
      steps: 2000,
      cadence: 100,
      inclinePercent: 4,
      inclineTarget: null,
      inclineGrade: 2,
      inclineScale: 'levels',
      button: null,
      childLock: false,
      controlLost: false,
      link: 'linked',
    },
    session: {
      startedAt: '2026-10-18T09:50:00.000Z',
      activeSeconds: 600,
      pausedSeconds: 0,
      zones: { walk: 600, jog: 0, run: 0 },
      maxKmh: 5,
      splits: [],
      climbM: 30,
    },
    body: {
      kcal: 80,
      kcalNet: 50,
      met: 3,
      weightKg: 70,
      heartRate: 120,
      kcalSource: 'belt',
      heartRateSource: 'grips',
    },
    ...over,
  };
}

describe('progress toward a session target', () => {
  it('has no progress without a target', () => {
    expect(targetProgress(NO_TARGET, frame())).toBeNull();
  });

  it('measures each kind from the live frame', () => {
    const at = (
      kind: 'time' | 'distance' | 'steps' | 'calories' | 'climb',
      value: number,
    ): ReturnType<typeof targetProgress> => targetProgress({ kind, value, zone: null }, frame());
    expect(at('time', 1200)).toMatchObject({ share: 0.5, label: '10:00 of 20:00', reached: false });
    expect(at('distance', 3000)?.label).toBe('1.50 of 3.00 km');
    expect(at('steps', 4000)).toMatchObject({ share: 0.5, label: '2,000 of 4,000 steps' });
    expect(at('calories', 160)?.label).toBe('80 of 160 kcal');
    expect(at('climb', 60)).toMatchObject({ share: 0.5, label: '30 of 60 m climb' });
  });

  it('is reached at the target and the share stops at one', () => {
    const done = targetProgress({ kind: 'time', value: 300, zone: null }, frame());
    expect(done).toMatchObject({ share: 1, reached: true });
  });

  it('has no progress for a figure the belt or the hub did not report', () => {
    const bare = frame({ session: null, body: null });
    expect(targetProgress({ kind: 'climb', value: 50, zone: null }, bare)).toBeNull();
    expect(targetProgress({ kind: 'calories', value: 100, zone: null }, bare)).toBeNull();
  });

  it('counts a target in the unit the stepper shows', () => {
    expect(targetUnit('time').factor).toBe(60);
    expect(targetUnit('distance').factor).toBe(1000);
  });

  it('writes the band of a heart rate zone in beats per minute', () => {
    expect(zoneBand('aerobic', 200)).toBe('Cardio, 140 to 159 bpm');
    expect(zoneBand('peak', 200)).toBe('Peak, 180 bpm and up');
  });
});
