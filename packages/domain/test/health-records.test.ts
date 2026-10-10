import { describe, expect, it } from 'vitest';
import { HEALTH_RECORD, HEALTH_RECORD_TYPES, NUTRIENTS, type HealthRecordType } from '../src';

const START = '2026-10-08T06:00:00Z';
const END = '2026-10-08T07:00:00.123456789Z';
const AT = '2026-10-08T06:30:00+02:00';

const SPAN = { startTime: START, endTime: END };

const INSTANT_TYPES: ReadonlySet<HealthRecordType> = new Set([
  'BasalBodyTemperature',
  'BasalMetabolicRate',
  'BloodGlucose',
  'BloodPressure',
  'BodyFat',
  'BodyTemperature',
  'BodyWaterMass',
  'BoneMass',
  'CervicalMucus',
  'HeartRateVariabilityRmssd',
  'Height',
  'IntermenstrualBleeding',
  'LeanBodyMass',
  'MenstruationFlow',
  'OvulationTest',
  'OxygenSaturation',
  'RespiratoryRate',
  'RestingHeartRate',
  'SexualActivity',
  'Vo2Max',
  'Weight',
]);

const FULL_NUTRITION = Object.fromEntries(
  NUTRIENTS.map((nutrient, index) => [nutrient, index + 1]),
);

const EXERCISE = {
  exerciseType: 56,
  title: 'Morning run',
  notes: null,
  plannedExerciseSessionId: 'planned-1',
  segments: [{ ...SPAN, segmentType: 2, repetitions: 4 }],
  laps: [
    { ...SPAN, meters: 1000 },
    { ...SPAN, meters: null },
  ],
  route: {
    status: 'recorded',
    locations: [
      {
        time: AT,
        latitude: 59.33,
        longitude: 18.06,
        altitudeMeters: 21,
        horizontalAccuracyMeters: 4,
        verticalAccuracyMeters: null,
      },
    ],
  },
};

const NUTRITION = {
  name: 'Oats',
  mealType: 1,
  kilocalories: 389,
  kilocaloriesFromFat: null,
  grams: FULL_NUTRITION,
};

const PLANNED = {
  exerciseType: 56,
  title: 'Intervals',
  notes: null,
  completedExerciseSessionId: null,
  blocks: [
    {
      repetitions: 3,
      description: null,
      steps: [
        {
          exerciseType: 56,
          exercisePhase: 3,
          description: 'Hard',
          completionGoal: { kind: 'distance', meters: 400 },
          performanceTargets: [{ kind: 'heart_rate', minBpm: 150, maxBpm: 170 }],
        },
      ],
    },
  ],
};

const SAMPLE_DATA: Readonly<Record<HealthRecordType, unknown>> = {
  ActiveCaloriesBurned: { kilocalories: 120.5 },
  BasalBodyTemperature: { celsius: 36.4, measurementLocation: 3 },
  BasalMetabolicRate: { kilocaloriesPerDay: 1650 },
  BloodGlucose: { millimolesPerLiter: 5.4, specimenSource: 1, mealType: 2, relationToMeal: 3 },
  BloodPressure: { systolicMmHg: 118, diastolicMmHg: 76, bodyPosition: 2, measurementLocation: 1 },
  BodyFat: { percent: 18.2 },
  BodyTemperature: { celsius: 36.9, measurementLocation: 5 },
  BodyWaterMass: { kilograms: 42 },
  BoneMass: { kilograms: 3.1 },
  CervicalMucus: { appearance: 2, sensation: 1 },
  CyclingPedalingCadence: { samples: [{ time: AT, revolutionsPerMinute: 88 }] },
  Distance: { meters: 5400 },
  ElevationGained: { meters: 32.5 },
  ExerciseSession: EXERCISE,
  FloorsClimbed: { floors: 7 },
  HeartRate: {
    samples: [
      { time: START, bpm: 61 },
      { time: AT, bpm: 140 },
    ],
  },
  HeartRateVariabilityRmssd: { milliseconds: 48.2 },
  Height: { meters: 1.82 },
  Hydration: { liters: 0.33 },
  IntermenstrualBleeding: {},
  LeanBodyMass: { kilograms: 61 },
  MenstruationFlow: { flow: 2 },
  MenstruationPeriod: {},
  MindfulnessSession: { mindfulnessSessionType: 2, title: null, notes: 'calm' },
  Nutrition: NUTRITION,
  OvulationTest: { result: 1 },
  OxygenSaturation: { percent: 97 },
  PlannedExerciseSession: PLANNED,
  Power: { samples: [{ time: AT, watts: 210 }] },
  RespiratoryRate: { rate: 14.5 },
  RestingHeartRate: { bpm: 52 },
  SexualActivity: { protectionUsed: 1 },
  SkinTemperature: {
    baselineCelsius: 33.1,
    measurementLocation: 2,
    deltas: [{ time: AT, celsius: -0.4 }],
  },
  SleepSession: {
    title: null,
    notes: null,
    stages: [{ ...SPAN, stage: 4 }],
  },
  Speed: { samples: [{ time: AT, metersPerSecond: 3.2 }] },
  Steps: { count: 8421 },
  StepsCadence: { samples: [{ time: AT, rate: 165 }] },
  TotalCaloriesBurned: { kilocalories: 2310 },
  Vo2Max: { mlPerKgPerMin: 47.5, measurementMethod: 2 },
  Weight: { kilograms: 78.4 },
  WheelchairPushes: { count: 120 },
};

function recordOf(type: HealthRecordType, overrides: Record<string, unknown> = {}): unknown {
  return {
    recordId: `hc-${type}`,
    type,
    startTime: START,
    endTime: INSTANT_TYPES.has(type) ? null : END,
    zoneOffsetSeconds: 7200,
    sourceApp: 'com.mi.health',
    lastModified: END,
    data: SAMPLE_DATA[type],
    ...overrides,
  };
}

function withData(type: HealthRecordType, data: unknown): unknown {
  return recordOf(type, { data });
}

function accepts(record: unknown): boolean {
  return HEALTH_RECORD.safeParse(record).success;
}

function plannedStep(step: Record<string, unknown>): unknown {
  return {
    exerciseType: 56,
    exercisePhase: 1,
    description: null,
    completionGoal: { kind: 'manual' },
    performanceTargets: [],
    ...step,
  };
}

function plannedWith(step: Record<string, unknown>): unknown {
  return withData('PlannedExerciseSession', {
    ...PLANNED,
    blocks: [{ repetitions: 1, description: 'Block', steps: [plannedStep(step)] }],
  });
}

describe('health record types', () => {
  it('lists every record type Health Connect 1.1.0 can read, each once', () => {
    expect(HEALTH_RECORD_TYPES).toStrictEqual(Object.keys(SAMPLE_DATA));
    expect(HEALTH_RECORD_TYPES).toHaveLength(41);
  });

  it('accepts a well-formed record of every type and keeps its data intact', () => {
    for (const type of HEALTH_RECORD_TYPES) {
      const parsed = HEALTH_RECORD.parse(recordOf(type));
      expect(parsed.type).toBe(type);
      expect(parsed.data).toStrictEqual(SAMPLE_DATA[type]);
    }
  });

  it('refuses a record of every type whose data belongs to another shape', () => {
    for (const type of HEALTH_RECORD_TYPES) {
      expect(accepts(withData(type, { unexpected: 1 }))).toBe(false);
    }
  });

  it('refuses an unknown type and unknown envelope fields', () => {
    expect(accepts(recordOf('Steps', { type: 'Stairs' }))).toBe(false);
    expect(accepts(recordOf('Steps', { origin: 'phone' }))).toBe(false);
  });

  it('requires an end time on interval records and forbids one on instantaneous records', () => {
    expect(accepts(recordOf('Steps', { endTime: null }))).toBe(false);
    expect(accepts(recordOf('Weight', { endTime: END }))).toBe(false);
    expect(accepts(recordOf('Weight', { endTime: null }))).toBe(true);
  });

  it('refuses an interval that ends before it starts, naming the end time', () => {
    const refused = HEALTH_RECORD.safeParse(
      recordOf('Steps', { startTime: '2026-10-08T07:00:00.5Z', endTime: '2026-10-08T07:00:00Z' }),
    );
    expect(refused.success).toBe(false);
    expect(refused.error?.issues).toStrictEqual([
      expect.objectContaining({
        message: 'endTime must not be before startTime',
        path: ['endTime'],
      }),
    ]);
    expect(accepts(recordOf('Steps', { startTime: END, endTime: END }))).toBe(true);
  });

  it('compares times as instants, not as text', () => {
    expect(
      accepts(recordOf('Steps', { startTime: '2026-10-08T08:00:00+02:00', endTime: START })),
    ).toBe(true);
  });

  it('accepts moments with an offset and refuses moments without one', () => {
    expect(accepts(recordOf('Weight', { startTime: AT }))).toBe(true);
    expect(accepts(recordOf('Weight', { startTime: '2026-10-08T06:00:00' }))).toBe(false);
  });

  it('bounds the record id, the source app and the zone offset', () => {
    expect(accepts(recordOf('Steps', { recordId: '' }))).toBe(false);
    expect(accepts(recordOf('Steps', { recordId: 'r'.repeat(200) }))).toBe(true);
    expect(accepts(recordOf('Steps', { recordId: 'r'.repeat(201) }))).toBe(false);
    expect(accepts(recordOf('Steps', { sourceApp: '' }))).toBe(false);
    expect(accepts(recordOf('Steps', { sourceApp: 'a'.repeat(255) }))).toBe(true);
    expect(accepts(recordOf('Steps', { sourceApp: 'a'.repeat(256) }))).toBe(false);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: null }))).toBe(true);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: -64_800 }))).toBe(true);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: 64_800 }))).toBe(true);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: -64_801 }))).toBe(false);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: 64_801 }))).toBe(false);
    expect(accepts(recordOf('Steps', { zoneOffsetSeconds: 1.5 }))).toBe(false);
  });

  it('refuses negative or fractional counts and negative amounts', () => {
    expect(accepts(withData('Steps', { count: -1 }))).toBe(false);
    expect(accepts(withData('Steps', { count: 1.5 }))).toBe(false);
    expect(accepts(withData('Steps', { count: 0 }))).toBe(true);
    expect(accepts(withData('Distance', { meters: -0.1 }))).toBe(false);
    expect(accepts(withData('Distance', { meters: 0 }))).toBe(true);
    expect(accepts(withData('Hydration', { liters: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(accepts(withData('HeartRate', { samples: [{ time: AT, bpm: 60.5 }] }))).toBe(false);
  });

  it('accepts negative measurements where Health Connect allows them', () => {
    expect(accepts(withData('ElevationGained', { meters: -12 }))).toBe(true);
    expect(accepts(withData('BodyTemperature', { celsius: -1, measurementLocation: 0 }))).toBe(
      true,
    );
  });

  it('refuses negative codes', () => {
    expect(accepts(withData('MenstruationFlow', { flow: -1 }))).toBe(false);
    expect(accepts(withData('MenstruationFlow', { flow: 0 }))).toBe(true);
  });

  it('keeps percentages between zero and one hundred', () => {
    expect(accepts(withData('OxygenSaturation', { percent: 100 }))).toBe(true);
    expect(accepts(withData('OxygenSaturation', { percent: 100.1 }))).toBe(false);
    expect(accepts(withData('BodyFat', { percent: -1 }))).toBe(false);
  });

  it('accepts only the nutrients Health Connect defines, each in grams', () => {
    expect(accepts(withData('Nutrition', { ...NUTRITION, grams: {} }))).toBe(true);
    expect(accepts(withData('Nutrition', { ...NUTRITION, grams: { gold: 1 } }))).toBe(false);
    expect(accepts(withData('Nutrition', { ...NUTRITION, grams: { zinc: -1 } }))).toBe(false);
    expect(NUTRIENTS).toHaveLength(40);
  });

  it('bounds every route location', () => {
    const at = (latitude: number, longitude: number): unknown =>
      withData('ExerciseSession', {
        ...EXERCISE,
        route: {
          status: 'recorded',
          locations: [
            {
              time: AT,
              latitude,
              longitude,
              altitudeMeters: -3,
              horizontalAccuracyMeters: null,
              verticalAccuracyMeters: 2,
            },
          ],
        },
      });
    expect(accepts(at(90, 180))).toBe(true);
    expect(accepts(at(-90, -180))).toBe(true);
    expect(accepts(at(90.1, 0))).toBe(false);
    expect(accepts(at(-90.1, 0))).toBe(false);
    expect(accepts(at(0, 180.1))).toBe(false);
    expect(accepts(at(0, -180.1))).toBe(false);
  });

  it('distinguishes a route that needs consent from one that is absent', () => {
    for (const status of ['consent_required', 'absent']) {
      expect(accepts(withData('ExerciseSession', { ...EXERCISE, route: { status } }))).toBe(true);
    }
    expect(accepts(withData('ExerciseSession', { ...EXERCISE, route: { status: 'lost' } }))).toBe(
      false,
    );
  });

  it('accepts every planned completion goal', () => {
    for (const completionGoal of [
      { kind: 'distance', meters: 400 },
      { kind: 'distance_and_duration', meters: 400, seconds: 90 },
      { kind: 'duration', seconds: 60 },
      { kind: 'repetitions', count: 12 },
      { kind: 'steps', count: 500 },
      { kind: 'total_calories', kilocalories: 50 },
      { kind: 'active_calories', kilocalories: 40 },
      { kind: 'manual' },
      { kind: 'unknown' },
    ]) {
      expect(accepts(plannedWith({ completionGoal }))).toBe(true);
    }
    expect(accepts(plannedWith({ completionGoal: { kind: 'forever' } }))).toBe(false);
  });

  it('accepts every planned performance target', () => {
    for (const target of [
      { kind: 'power', minWatts: 200, maxWatts: 250 },
      { kind: 'speed', minMetersPerSecond: 3, maxMetersPerSecond: 4 },
      { kind: 'cadence', minRate: 80, maxRate: 90 },
      { kind: 'heart_rate', minBpm: 120, maxBpm: 140 },
      { kind: 'weight', kilograms: 60 },
      { kind: 'rate_of_perceived_exertion', rpe: 10 },
      { kind: 'amrap' },
      { kind: 'unknown' },
    ]) {
      expect(accepts(plannedWith({ performanceTargets: [target] }))).toBe(true);
    }
    expect(
      accepts(
        plannedWith({ performanceTargets: [{ kind: 'rate_of_perceived_exertion', rpe: 11 }] }),
      ),
    ).toBe(false);
  });
});
