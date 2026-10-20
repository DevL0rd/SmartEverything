import { describe, expect, it } from 'vitest';
import { exerciseKindOf, isDistanceBased } from '../../health-log';
import {
  heartSamplesOf,
  latestSample,
  maximumHeartRate,
  minutesAbove,
  sampleStats,
  zoneMinutes,
  zoneDays,
  zoneMinutesByDay,
  zoneTotals,
  zoneOf,
} from './heart';
import { overlapping } from './records';
import { at, seedRecord } from './test-support';
import { paceText, personalRecords, routeDrawing, tempoText, workoutsOf } from './workouts';

function run(day: number, minutes: number, route: object): ReturnType<typeof seedRecord> {
  return seedRecord({
    type: 'ExerciseSession',
    start: at(day, 7),
    end: at(day, 7, minutes),
    data: {
      exerciseType: 56,
      title: null,
      notes: null,
      plannedExerciseSessionId: null,
      segments: [],
      laps: [],
      route,
    },
  });
}

const ROUTE = {
  status: 'recorded',
  locations: [
    { latitude: 51.5, longitude: -0.12 },
    { latitude: 51.51, longitude: -0.1 },
  ].map((point, index) => ({
    ...point,
    time: at(8, 7, index).toISOString(),
    altitudeMeters: null,
    horizontalAccuracyMeters: null,
    verticalAccuracyMeters: null,
  })),
};

function heart(day: number, beats: readonly number[]): ReturnType<typeof seedRecord> {
  return seedRecord({
    type: 'HeartRate',
    start: at(day, 7),
    end: at(day, 7, beats.length),
    data: { samples: beats.map((bpm, index) => ({ time: at(day, 7, index).toISOString(), bpm })) },
  });
}

describe('workouts', () => {
  const records = [
    run(8, 30, ROUTE),
    run(6, 20, { status: 'absent' }),
    seedRecord({ type: 'Distance', start: at(8, 7), end: at(8, 7, 30), data: { meters: 5000 } }),
    seedRecord({
      type: 'Distance',
      start: at(8, 7, 15),
      end: at(8, 7, 45),
      data: { meters: 1000 },
    }),
    seedRecord({ type: 'Distance', start: at(6, 7), end: at(6, 7, 20), data: { meters: 4000 } }),
    seedRecord({
      type: 'ActiveCaloriesBurned',
      start: at(8, 7),
      end: at(8, 7, 30),
      data: { kilocalories: 320 },
    }),
    heart(8, [120, 150, 160]),
  ];

  it('attributes the session share of distance and energy recorded in its hours and reads the heart rate inside', () => {
    const [today, earlier] = workoutsOf(records);
    expect(today).toMatchObject({
      name: 'Running',
      minutes: 30,
      meters: 5500,
      kilocalories: 320,
      maxBpm: 160,
      route: { status: 'recorded' },
    });
    expect(today!.averageBpm).toBeCloseTo(430 / 3);
    expect(today!.secondsPerKm).toBeCloseTo(1800 / 5.5);
    expect(earlier).toMatchObject({ kilocalories: null, heart: [] });
  });

  it('personal records pick the best session per activity', () => {
    const found = personalRecords(workoutsOf(records));
    expect(found.map((entry) => `${entry.label}:${String(Math.round(entry.value))}`)).toEqual([
      'Longest distance:5500',
      'Longest session:30',
      'Fastest pace:300',
      'Most energy:320',
    ]);
  });

  it('shows no distance or pace when the only distance record spans far more than the session', () => {
    const [workout] = workoutsOf([
      run(8, 42, { status: 'absent' }),
      seedRecord({ type: 'Distance', start: at(8, 0), end: at(9, 0), data: { meters: 7500 } }),
    ]);
    expect(workout).toMatchObject({ meters: null, secondsPerKm: null });
  });

  it('shows no pace below one kilometre but still shows the distance', () => {
    const short = [
      run(8, 10, { status: 'absent' }),
      seedRecord({ type: 'Distance', start: at(8, 7), end: at(8, 7, 10), data: { meters: 800 } }),
    ];
    expect(workoutsOf(short)[0]).toMatchObject({ meters: 800, secondsPerKm: null });
    expect(personalRecords(workoutsOf(short)).map((entry) => entry.label)).not.toContain(
      'Fastest pace',
    );
  });

  it('draws a route scaled into a square box', () => {
    const drawing = routeDrawing(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0.01, longitude: 0.02 },
      ],
      100,
    );
    expect(drawing?.path).toBe('M0.0 50.0 L100.0 0.0');
    expect(drawing?.width).toBeCloseTo(100);
    expect(drawing?.height).toBeCloseTo(50);
    expect(routeDrawing([{ latitude: 0, longitude: 0 }], 100)).toBeNull();
  });

  it('pace reads minutes and seconds per kilometre', () => {
    expect(paceText(341)).toBe('5:41\u00a0/km');
    expect(tempoText(56, 341)).toBe('5:41\u00a0/km');
    expect(tempoText(8, 150)).toBe('24.0\u00a0km/h');
  });

  it('gives strength sessions no distance even when walking was recorded at the time', () => {
    const lifting = seedRecord({
      type: 'ExerciseSession',
      start: at(9, 18),
      end: at(9, 19),
      data: {
        exerciseType: 70,
        title: null,
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    });
    const walked = seedRecord({
      type: 'Distance',
      start: at(9, 18),
      end: at(9, 19),
      data: { meters: 300 },
    });
    expect(workoutsOf([lifting, walked])[0]).toMatchObject({ meters: null, secondsPerKm: null });
  });

  it('names known exercise types and admits unknown ones', () => {
    expect(exerciseKindOf(79).name).toBe('Walking');
    expect(exerciseKindOf(1234).name).toBe('Exercise type 1234');
    expect(isDistanceBased(56)).toBe(true);
    expect(isDistanceBased(70)).toBe(false);
  });

  it('instant records overlap a window only when they fall inside it', () => {
    const weight = seedRecord({ type: 'Weight', start: at(8, 7), data: { kilograms: 80 } });
    expect(overlapping([weight], at(8, 7).getTime(), at(8, 8).getTime())).toHaveLength(1);
    expect(overlapping([weight], at(8, 8).getTime(), at(8, 9).getTime())).toHaveLength(0);
  });
});

describe('heart rate zones', () => {
  it('places a heart rate in the zone for its share of the maximum', () => {
    expect(zoneOf(80, 200)).toBeNull();
    expect(zoneOf(100, 200)).toBe('warm');
    expect(zoneOf(150, 200)).toBe('aerobic');
    expect(zoneOf(190, 200)).toBe('peak');
  });

  it('counts the time until the next sample, capped, in each zone', () => {
    const samples = heartSamplesOf([heart(8, [100, 150, 160])]);
    const zones = zoneMinutes(samples, 200);
    expect(zones).toEqual({ warm: 1, easy: 0, aerobic: 1, hard: 1, peak: 0 });
    expect(minutesAbove(zones, 'aerobic')).toBe(2);
    const gapped = zoneMinutes(
      [
        { at: 0, bpm: 150 },
        { at: 60 * 60_000, bpm: 150 },
      ],
      200,
    );
    expect(gapped.aerobic).toBe(6);
  });

  it('splits zone minutes by day', () => {
    const byDay = zoneMinutesByDay(heartSamplesOf([heart(7, [150]), heart(8, [190])]), 200);
    expect(byDay.get('2026-10-07')?.aerobic).toBe(1);
    expect(byDay.get('2026-10-08')?.peak).toBe(1);
  });

  it('lines zone minutes up against a list of days and totals them', () => {
    const samples = heartSamplesOf([heart(7, [150]), heart(8, [190])]);
    const days = zoneDays(samples, 200, [
      { day: '2026-10-06', label: 'Tue' },
      { day: '2026-10-07', label: 'Wed' },
      { day: '2026-10-08', label: 'Thu' },
    ]);
    expect(days.map((entry) => entry.total)).toEqual([0, 1, 1]);
    expect(zoneTotals(days)).toEqual({ warm: 0, easy: 0, aerobic: 1, hard: 0, peak: 1 });
  });

  it('reads the extremes of half a million samples without exceeding the argument limit', () => {
    const samples = Array.from({ length: 500_000 }, (_, index) => ({
      at: index,
      bpm: 60 + (index % 100),
    }));
    expect(sampleStats(samples)).toEqual({ min: 60, mean: 109.5, max: 159 });
    expect(
      maximumHeartRate(
        null,
        samples.map((sample) => sample.bpm),
      ),
    ).toEqual({ bpm: 159, basis: 'observed' });
  });

  it('uses the maximum heart rate setting before the highest one observed', () => {
    const samples = [
      { at: 1, bpm: 120 },
      { at: 2, bpm: 171 },
    ];
    expect(maximumHeartRate(185, [171])).toEqual({ bpm: 185, basis: 'setting' });
    expect(
      maximumHeartRate(
        null,
        samples.map((sample) => sample.bpm),
      ),
    ).toEqual({
      bpm: 171,
      basis: 'observed',
    });
    expect(maximumHeartRate(null, [])).toBeNull();
    expect(latestSample(samples)).toEqual({ at: 2, bpm: 171 });
    expect(latestSample([])).toBeNull();
    expect(sampleStats(samples)).toEqual({ min: 120, mean: 145.5, max: 171 });
    expect(sampleStats([])).toBeNull();
  });
});

describe('one workout for the same walk seen by two sources', () => {
  const OWN = 'smarteverything.treadmill';

  function treadmillWalk(day: number, minutes: number): ReturnType<typeof seedRecord> {
    return seedRecord({
      type: 'ExerciseSession',
      start: at(day, 7, 2),
      end: at(day, 7, 2 + minutes),
      source: OWN,
      data: {
        exerciseType: 57,
        title: 'Treadmill walk',
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    });
  }

  function watchWalk(day: number, minutes: number): ReturnType<typeof seedRecord> {
    return seedRecord({
      type: 'ExerciseSession',
      start: at(day, 7),
      end: at(day, 7, minutes),
      data: {
        exerciseType: 79,
        title: null,
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    });
  }

  function speeds(
    day: number,
    minutes: number,
    metersPerSecond: number,
  ): ReturnType<typeof seedRecord> {
    const count = (minutes * 60) / 10;
    return seedRecord({
      type: 'Speed',
      start: at(day, 7, 2),
      end: at(day, 7, 2 + minutes),
      source: OWN,
      data: {
        samples: Array.from({ length: count + 1 }, (_, index) => ({
          time: new Date(at(day, 7, 2).getTime() + index * 10_000).toISOString(),
          metersPerSecond,
        })),
      },
    });
  }

  it('shows the treadmill and the watch once, with the belt as the workout and the watch heart rate and energy', () => {
    const rows = workoutsOf([
      watchWalk(8, 30),
      treadmillWalk(8, 28),
      speeds(8, 28, 1.25),
      heart(8, [100, 110, 120]),
      seedRecord({
        type: 'ActiveCaloriesBurned',
        start: at(8, 7),
        end: at(8, 7, 30),
        data: { kilocalories: 150 },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: OWN,
      name: 'Treadmill',
      minutes: 28,
      maxBpm: 120,
    });
    expect(rows[0]?.kilocalories).toBeGreaterThan(130);
    expect(rows[0]?.meters).toBeCloseTo(1.25 * 28 * 60, 0);
  });

  it('takes the watch distance and energy for its hours over the belt and does not add the phone on top', () => {
    const watch = 'smarteverything.watch';
    const phone = 'com.android.healthconnect.phone.j1';
    const rows = workoutsOf([
      treadmillWalk(8, 28),
      speeds(8, 28, 1.25),
      seedRecord({
        type: 'Distance',
        start: at(8, 7),
        end: at(8, 7, 40),
        source: watch,
        data: { meters: 2000 },
      }),
      seedRecord({
        type: 'ActiveCaloriesBurned',
        start: at(8, 7),
        end: at(8, 7, 40),
        source: watch,
        data: { kilocalories: 200 },
      }),
      seedRecord({
        type: 'Distance',
        start: at(8, 7, 5),
        end: at(8, 7, 25),
        source: phone,
        data: { meters: 900 },
      }),
      seedRecord({
        type: 'ActiveCaloriesBurned',
        start: at(8, 7, 5),
        end: at(8, 7, 25),
        source: phone,
        data: { kilocalories: 50 },
      }),
    ]);
    expect(rows[0]?.meters).toBeCloseTo((2000 * 28) / 40);
    expect(rows[0]?.kilocalories).toBeCloseTo((200 * 28) / 40);
  });

  it('keeps two sessions apart when they do not overlap', () => {
    const rows = workoutsOf([watchWalk(8, 20), treadmillWalk(9, 20)]);
    expect(rows.map((row) => row.source).sort()).toEqual(['com.mi.health', OWN]);
  });

  it('keeps a short session that only touches the end of a long one', () => {
    const long = watchWalk(8, 60);
    const touching = seedRecord({
      type: 'ExerciseSession',
      start: at(8, 7, 58),
      end: at(8, 8, 10),
      source: OWN,
      data: {
        exerciseType: 57,
        title: null,
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    });
    expect(workoutsOf([long, touching])).toHaveLength(2);
  });

  it('prefers the longer of two sessions from other apps and keeps the distance of either', () => {
    const phone = seedRecord({
      type: 'ExerciseSession',
      start: at(8, 7, 5),
      end: at(8, 7, 25),
      source: 'com.android.healthconnect.phone',
      data: {
        exerciseType: 79,
        title: null,
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    });
    const rows = workoutsOf([
      watchWalk(8, 30),
      phone,
      seedRecord({
        type: 'Distance',
        start: at(8, 7, 5),
        end: at(8, 7, 25),
        data: { meters: 2000 },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'com.mi.health', minutes: 30, meters: 2000 });
  });
});
