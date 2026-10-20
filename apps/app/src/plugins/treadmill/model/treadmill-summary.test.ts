import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { goalProgress, goalValueUnit, speedSummary } from './treadmill-summary';

function frame(over: {
  readonly timeS?: number;
  readonly distanceM?: number;
  readonly kcal?: number | null;
}): TreadmillLiveFrame {
  return {
    at: '2026-10-18T10:00:00.000Z',
    belt: {
      state: 'running',
      mode: 'manual',
      speedKmh: 4,
      targetSpeedKmh: null,
      timeS: over.timeS ?? 600,
      distanceM: over.distanceM ?? 1000,
      steps: 1200,
      cadence: 100,
      inclinePercent: null,
      inclineTarget: null,
      inclineGrade: null,
      inclineScale: 'unconfirmed',
      button: null,
      childLock: false,
      controlLost: false,
      link: 'linked',
    },
    session: null,
    body:
      over.kcal === null
        ? null
        : {
            kcal: over.kcal ?? 50,
            kcalNet: 30,
            met: 3,
            weightKg: 70,
            heartRate: null,
            kcalSource: 'estimate',
            heartRateSource: null,
          },
  };
}

describe('chart sentences for a screen reader', () => {
  it('names the range and the average of the last minutes of speed', () => {
    expect(
      speedSummary(
        [
          { t: 1, v: 3 },
          { t: 2, v: 7.2 },
          { t: 3, v: 5.4 },
        ],
        5,
      ),
    ).toBe('Speed, last 5 minutes, 3.0 to 7.2 km/h, average 5.2');
    expect(speedSummary([], 5)).toBe('Speed, last 5 minutes, no data yet');
  });
});

describe('the goal set on the pad', () => {
  it('follows time, distance and calories and caps the ring at one', () => {
    expect(
      goalProgress({ goalKind: 'time', goalValue: 1200 }, frame({ timeS: 300 })),
    ).toMatchObject({
      kind: 'time',
      share: 0.25,
      label: '05:00 of 20:00',
    });
    expect(
      goalProgress({ goalKind: 'distance', goalValue: 2000 }, frame({ distanceM: 2500 })),
    ).toMatchObject({ kind: 'distance', share: 1, label: '2.50 of 2.00 km' });
    expect(
      goalProgress({ goalKind: 'calories', goalValue: 100 }, frame({ kcal: 25 })),
    ).toMatchObject({
      kind: 'calories',
      share: 0.25,
      label: '25 of 100 kcal',
    });
  });

  it('shows nothing without a goal, and no calorie goal to someone who may not see body data', () => {
    expect(goalProgress({}, frame({}))).toBeNull();
    expect(goalProgress({ goalKind: 'none', goalValue: 5 }, frame({}))).toBeNull();
    expect(goalProgress({ goalKind: 'time', goalValue: 0 }, frame({}))).toBeNull();
    expect(
      goalProgress({ goalKind: 'calories', goalValue: 100 }, frame({ kcal: null })),
    ).toBeNull();
  });

  it('offers a stepper range for each kind of goal', () => {
    expect(goalValueUnit('time').unit).toBe('min');
    expect(goalValueUnit('distance')).toMatchObject({ initial: 2, factor: 1000 });
    expect(goalValueUnit('calories').step).toBe(10);
  });
});
