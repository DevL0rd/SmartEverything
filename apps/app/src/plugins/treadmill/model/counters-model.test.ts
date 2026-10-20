import type { TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { countersOf, inclineText, TREND_OF } from './counters-model';

function frame(over: Partial<TreadmillLiveFrame> = {}): TreadmillLiveFrame {
  return {
    at: '2026-10-18T10:00:00.000Z',
    belt: {
      state: 'running',
      mode: 'manual',
      speedKmh: 4.5,
      targetSpeedKmh: null,
      timeS: 754,
      distanceM: 930,
      steps: 1260,
      cadence: 104,
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
    body: {
      kcal: 63.4,
      kcalNet: 41.2,
      met: 3.3,
      weightKg: 74,
      heartRate: 118,
      kcalSource: 'belt',
      heartRateSource: 'watch',
    },
    ...over,
  };
}

describe('the numbers of a session in progress', () => {
  it('lists time, distance, steps, energy, heart rate, pace and cadence for the walker', () => {
    const specs = countersOf({ bodyVisible: true }, frame());
    expect(specs.map((spec) => spec.key)).toEqual([
      'time',
      'distance',
      'steps',
      'energy',
      'heart',
      'pace',
      'cadence',
    ]);
    expect(specs.find((spec) => spec.key === 'time')?.value).toBe('12:34');
    expect(specs.find((spec) => spec.key === 'energy')).toMatchObject({
      value: '63',
      note: 'Net 41 kcal, from the belt',
    });
    expect(specs.find((spec) => spec.key === 'heart')).toMatchObject({
      value: '118',
      note: 'Watch',
    });
    expect(specs.find((spec) => spec.key === 'pace')?.value).toBe('13:20 /km');
  });

  it('leaves out energy, net energy and heart rate for anyone who may not see body data', () => {
    const specs = countersOf({ bodyVisible: false }, frame());
    expect(specs.map((spec) => spec.key)).toEqual(['time', 'distance', 'steps', 'pace', 'cadence']);
    expect(JSON.stringify(specs)).not.toContain('kcal');
    expect(JSON.stringify(specs)).not.toContain('bpm');
  });

  it('leaves out what the belt did not report', () => {
    const specs = countersOf(
      { bodyVisible: true },
      frame({
        body: null,
        belt: { ...frame().belt, steps: null, cadence: null },
      }),
    );
    expect(specs.map((spec) => spec.key)).toEqual(['time', 'distance', 'pace']);
  });

  it('reads each trend from the matching measure', () => {
    const point = {
      t: 1,
      speed: 4,
      distanceM: 10,
      steps: 20,
      cadence: 90,
      kcal: 5,
      incline: 4,
      heartRate: 120,
      climbM: 12,
    };
    expect(TREND_OF.distance(point)).toBe(10);
    expect(TREND_OF.steps(point)).toBe(20);
    expect(TREND_OF.cadence(point)).toBe(90);
    expect(TREND_OF.kcal(point)).toBe(5);
    expect(TREND_OF.heart(point)).toBe(120);
    expect(TREND_OF.climb(point)).toBe(12);
    expect(TREND_OF.pace(point)).toBe(900);
    expect(TREND_OF.pace({ ...point, speed: 0 })).toBeNull();
  });

  it('shows the climb in violet once the hub reports it, and none while it is unknown', () => {
    const session = {
      startedAt: '2026-10-18T10:00:00.000Z',
      activeSeconds: 600,
      pausedSeconds: 0,
      zones: { walk: 600, jog: 0, run: 0 },
      maxKmh: 5,
      splits: [],
      climbM: 23.6,
    };
    const climbing = countersOf({ bodyVisible: false }, frame({ session }));
    expect(climbing.find((spec) => spec.key === 'climb')).toMatchObject({
      value: '24',
      unit: 'm',
      colour: 'viz-violet',
    });
    const unknown = countersOf(
      { bodyVisible: false },
      frame({ session: { ...session, climbM: null } }),
    );
    expect(unknown.some((spec) => spec.key === 'climb')).toBe(false);
  });

  it('names the heart rate source and the zone from the maximum heart rate', () => {
    const grips = frame({
      body: {
        kcal: 10,
        kcalNet: 6,
        met: 3,
        weightKg: 70,
        heartRate: 150,
        kcalSource: 'estimate',
        heartRateSource: 'grips',
      },
    });
    const specs = countersOf({ bodyVisible: true }, grips, 200);
    expect(specs.find((spec) => spec.key === 'heart')?.note).toBe('Grips, Cardio');
    expect(specs.find((spec) => spec.key === 'energy')?.note).toBe('Net 6 kcal, estimated');
  });

  it('writes the incline by the confirmed scale and bare while it is unconfirmed', () => {
    expect(inclineText(6, 'percent')).toBe('6 %');
    expect(inclineText(6, 'levels')).toBe('Level 6');
    expect(inclineText(6, 'unconfirmed')).toBe('6');
  });
});
