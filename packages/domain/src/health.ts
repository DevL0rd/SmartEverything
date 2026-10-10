import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

export const HEALTH_RECORD_TYPES = [
  'ActiveCaloriesBurned',
  'BasalBodyTemperature',
  'BasalMetabolicRate',
  'BloodGlucose',
  'BloodPressure',
  'BodyFat',
  'BodyTemperature',
  'BodyWaterMass',
  'BoneMass',
  'CervicalMucus',
  'CyclingPedalingCadence',
  'Distance',
  'ElevationGained',
  'ExerciseSession',
  'FloorsClimbed',
  'HeartRate',
  'HeartRateVariabilityRmssd',
  'Height',
  'Hydration',
  'IntermenstrualBleeding',
  'LeanBodyMass',
  'MenstruationFlow',
  'MenstruationPeriod',
  'MindfulnessSession',
  'Nutrition',
  'OvulationTest',
  'OxygenSaturation',
  'PlannedExerciseSession',
  'Power',
  'RespiratoryRate',
  'RestingHeartRate',
  'SexualActivity',
  'SkinTemperature',
  'SleepSession',
  'Speed',
  'Steps',
  'StepsCadence',
  'TotalCaloriesBurned',
  'Vo2Max',
  'Weight',
  'WheelchairPushes',
] as const;

export const HEALTH_RECORD_TYPE = z.enum(HEALTH_RECORD_TYPES);

export type HealthRecordType = z.infer<typeof HEALTH_RECORD_TYPE>;

export const NUTRIENTS = [
  'biotin',
  'caffeine',
  'calcium',
  'chloride',
  'cholesterol',
  'chromium',
  'copper',
  'dietaryFiber',
  'folate',
  'folicAcid',
  'iodine',
  'iron',
  'magnesium',
  'manganese',
  'molybdenum',
  'monounsaturatedFat',
  'niacin',
  'pantothenicAcid',
  'phosphorus',
  'polyunsaturatedFat',
  'potassium',
  'protein',
  'riboflavin',
  'saturatedFat',
  'selenium',
  'sodium',
  'sugar',
  'thiamin',
  'totalCarbohydrate',
  'totalFat',
  'transFat',
  'unsaturatedFat',
  'vitaminA',
  'vitaminB12',
  'vitaminB6',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'zinc',
] as const;

export const HEALTH_BATCH_LIMIT = 500;

const MOMENT = z.iso.datetime({ offset: true });
const CODE = z.number().int().min(0);
const COUNT = z.number().int().min(0);
const AMOUNT = z.number().min(0);
const MEASURE = z.number();
const TEXT = z.string().nullable();
const RECORD_ID = z.string().min(1).max(200);
const ZONE_OFFSET = z.number().int().min(-64_800).max(64_800).nullable();
const SPAN = { startTime: MOMENT, endTime: MOMENT };
const NOTHING = z.strictObject({});

const SAMPLED_AT = { time: MOMENT };

const ENERGY = z.strictObject({ kilocalories: AMOUNT });
const LENGTH = z.strictObject({ meters: AMOUNT });
const MASS = z.strictObject({ kilograms: AMOUNT });
const PERCENT = z.strictObject({ percent: AMOUNT.max(100) });
const TEMPERATURE = z.strictObject({ celsius: MEASURE, measurementLocation: CODE });
const COUNTED = z.strictObject({ count: COUNT });
const NAMED = { title: TEXT, notes: TEXT };

const ROUTE = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('recorded'),
    locations: z.array(
      z.strictObject({
        time: MOMENT,
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        altitudeMeters: MEASURE.nullable(),
        horizontalAccuracyMeters: AMOUNT.nullable(),
        verticalAccuracyMeters: AMOUNT.nullable(),
      }),
    ),
  }),
  z.strictObject({ status: z.literal('consent_required') }),
  z.strictObject({ status: z.literal('absent') }),
]);

const COMPLETION_GOAL = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('distance'), meters: AMOUNT }),
  z.strictObject({ kind: z.literal('distance_and_duration'), meters: AMOUNT, seconds: AMOUNT }),
  z.strictObject({ kind: z.literal('duration'), seconds: AMOUNT }),
  z.strictObject({ kind: z.literal('repetitions'), count: COUNT }),
  z.strictObject({ kind: z.literal('steps'), count: COUNT }),
  z.strictObject({ kind: z.literal('total_calories'), kilocalories: AMOUNT }),
  z.strictObject({ kind: z.literal('active_calories'), kilocalories: AMOUNT }),
  z.strictObject({ kind: z.literal('manual') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);

const PERFORMANCE_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('power'), minWatts: AMOUNT, maxWatts: AMOUNT }),
  z.strictObject({
    kind: z.literal('speed'),
    minMetersPerSecond: AMOUNT,
    maxMetersPerSecond: AMOUNT,
  }),
  z.strictObject({ kind: z.literal('cadence'), minRate: AMOUNT, maxRate: AMOUNT }),
  z.strictObject({ kind: z.literal('heart_rate'), minBpm: AMOUNT, maxBpm: AMOUNT }),
  z.strictObject({ kind: z.literal('weight'), kilograms: AMOUNT }),
  z.strictObject({ kind: z.literal('rate_of_perceived_exertion'), rpe: COUNT.max(10) }),
  z.strictObject({ kind: z.literal('amrap') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);

const EXERCISE_SESSION = z.strictObject({
  exerciseType: CODE,
  ...NAMED,
  plannedExerciseSessionId: TEXT,
  segments: z.array(z.strictObject({ ...SPAN, segmentType: CODE, repetitions: COUNT })),
  laps: z.array(z.strictObject({ ...SPAN, meters: AMOUNT.nullable() })),
  route: ROUTE,
});

const PLANNED_EXERCISE_SESSION = z.strictObject({
  exerciseType: CODE,
  ...NAMED,
  completedExerciseSessionId: TEXT,
  blocks: z.array(
    z.strictObject({
      repetitions: COUNT,
      description: TEXT,
      steps: z.array(
        z.strictObject({
          exerciseType: CODE,
          exercisePhase: CODE,
          description: TEXT,
          completionGoal: COMPLETION_GOAL,
          performanceTargets: z.array(PERFORMANCE_TARGET),
        }),
      ),
    }),
  ),
});

const NUTRITION = z.strictObject({
  name: TEXT,
  mealType: CODE,
  kilocalories: AMOUNT.nullable(),
  kilocaloriesFromFat: AMOUNT.nullable(),
  grams: z.partialRecord(z.enum(NUTRIENTS), AMOUNT),
});

const ENVELOPE = z.strictObject({
  recordId: RECORD_ID,
  startTime: MOMENT,
  zoneOffsetSeconds: ZONE_OFFSET,
  sourceApp: z.string().min(1).max(255),
  lastModified: MOMENT,
});

const INTERVAL = ENVELOPE.extend({ endTime: MOMENT });
const INSTANT = ENVELOPE.extend({ endTime: z.null() });

export const HEALTH_RECORD_VARIANTS = [
  INTERVAL.extend({ type: z.literal('ActiveCaloriesBurned'), data: ENERGY }),
  INSTANT.extend({ type: z.literal('BasalBodyTemperature'), data: TEMPERATURE }),
  INSTANT.extend({
    type: z.literal('BasalMetabolicRate'),
    data: z.strictObject({ kilocaloriesPerDay: AMOUNT }),
  }),
  INSTANT.extend({
    type: z.literal('BloodGlucose'),
    data: z.strictObject({
      millimolesPerLiter: AMOUNT,
      specimenSource: CODE,
      mealType: CODE,
      relationToMeal: CODE,
    }),
  }),
  INSTANT.extend({
    type: z.literal('BloodPressure'),
    data: z.strictObject({
      systolicMmHg: AMOUNT,
      diastolicMmHg: AMOUNT,
      bodyPosition: CODE,
      measurementLocation: CODE,
    }),
  }),
  INSTANT.extend({ type: z.literal('BodyFat'), data: PERCENT }),
  INSTANT.extend({ type: z.literal('BodyTemperature'), data: TEMPERATURE }),
  INSTANT.extend({ type: z.literal('BodyWaterMass'), data: MASS }),
  INSTANT.extend({ type: z.literal('BoneMass'), data: MASS }),
  INSTANT.extend({
    type: z.literal('CervicalMucus'),
    data: z.strictObject({ appearance: CODE, sensation: CODE }),
  }),
  INTERVAL.extend({
    type: z.literal('CyclingPedalingCadence'),
    data: z.strictObject({
      samples: z.array(z.strictObject({ ...SAMPLED_AT, revolutionsPerMinute: AMOUNT })),
    }),
  }),
  INTERVAL.extend({ type: z.literal('Distance'), data: LENGTH }),
  INTERVAL.extend({
    type: z.literal('ElevationGained'),
    data: z.strictObject({ meters: MEASURE }),
  }),
  INTERVAL.extend({ type: z.literal('ExerciseSession'), data: EXERCISE_SESSION }),
  INTERVAL.extend({ type: z.literal('FloorsClimbed'), data: z.strictObject({ floors: AMOUNT }) }),
  INTERVAL.extend({
    type: z.literal('HeartRate'),
    data: z.strictObject({ samples: z.array(z.strictObject({ ...SAMPLED_AT, bpm: COUNT })) }),
  }),
  INSTANT.extend({
    type: z.literal('HeartRateVariabilityRmssd'),
    data: z.strictObject({ milliseconds: AMOUNT }),
  }),
  INSTANT.extend({ type: z.literal('Height'), data: LENGTH }),
  INTERVAL.extend({ type: z.literal('Hydration'), data: z.strictObject({ liters: AMOUNT }) }),
  INSTANT.extend({ type: z.literal('IntermenstrualBleeding'), data: NOTHING }),
  INSTANT.extend({ type: z.literal('LeanBodyMass'), data: MASS }),
  INSTANT.extend({ type: z.literal('MenstruationFlow'), data: z.strictObject({ flow: CODE }) }),
  INTERVAL.extend({ type: z.literal('MenstruationPeriod'), data: NOTHING }),
  INTERVAL.extend({
    type: z.literal('MindfulnessSession'),
    data: z.strictObject({ mindfulnessSessionType: CODE, ...NAMED }),
  }),
  INTERVAL.extend({ type: z.literal('Nutrition'), data: NUTRITION }),
  INSTANT.extend({ type: z.literal('OvulationTest'), data: z.strictObject({ result: CODE }) }),
  INSTANT.extend({ type: z.literal('OxygenSaturation'), data: PERCENT }),
  INTERVAL.extend({ type: z.literal('PlannedExerciseSession'), data: PLANNED_EXERCISE_SESSION }),
  INTERVAL.extend({
    type: z.literal('Power'),
    data: z.strictObject({ samples: z.array(z.strictObject({ ...SAMPLED_AT, watts: AMOUNT })) }),
  }),
  INSTANT.extend({ type: z.literal('RespiratoryRate'), data: z.strictObject({ rate: AMOUNT }) }),
  INSTANT.extend({ type: z.literal('RestingHeartRate'), data: z.strictObject({ bpm: COUNT }) }),
  INSTANT.extend({
    type: z.literal('SexualActivity'),
    data: z.strictObject({ protectionUsed: CODE }),
  }),
  INTERVAL.extend({
    type: z.literal('SkinTemperature'),
    data: z.strictObject({
      baselineCelsius: MEASURE.nullable(),
      measurementLocation: CODE,
      deltas: z.array(z.strictObject({ time: MOMENT, celsius: MEASURE })),
    }),
  }),
  INTERVAL.extend({
    type: z.literal('SleepSession'),
    data: z.strictObject({
      ...NAMED,
      stages: z.array(z.strictObject({ ...SPAN, stage: CODE })),
    }),
  }),
  INTERVAL.extend({
    type: z.literal('Speed'),
    data: z.strictObject({
      samples: z.array(z.strictObject({ ...SAMPLED_AT, metersPerSecond: AMOUNT })),
    }),
  }),
  INTERVAL.extend({ type: z.literal('Steps'), data: COUNTED }),
  INTERVAL.extend({
    type: z.literal('StepsCadence'),
    data: z.strictObject({ samples: z.array(z.strictObject({ ...SAMPLED_AT, rate: AMOUNT })) }),
  }),
  INTERVAL.extend({ type: z.literal('TotalCaloriesBurned'), data: ENERGY }),
  INSTANT.extend({
    type: z.literal('Vo2Max'),
    data: z.strictObject({ mlPerKgPerMin: AMOUNT, measurementMethod: CODE }),
  }),
  INSTANT.extend({ type: z.literal('Weight'), data: MASS }),
  INTERVAL.extend({ type: z.literal('WheelchairPushes'), data: COUNTED }),
] as const;

export const HEALTH_RECORD = z
  .discriminatedUnion('type', HEALTH_RECORD_VARIANTS)
  .refine(
    (record) =>
      record.endTime === null || Date.parse(record.endTime) >= Date.parse(record.startTime),
    {
      message: 'endTime must not be before startTime',
      path: ['endTime'],
    },
  );

export type HealthRecord = z.infer<typeof HEALTH_RECORD>;

export const HEALTH_BATCH_SOURCE = z.strictObject({
  device: z.string().min(1).max(120),
  appVersion: z.string().min(1).max(40),
});

const distinct = (values: readonly string[]): boolean => new Set(values).size === values.length;

export const HEALTH_BATCH = z.strictObject({
  records: z
    .array(HEALTH_RECORD)
    .max(HEALTH_BATCH_LIMIT)
    .refine((records) => distinct(records.map((record) => record.recordId)), {
      message: 'each recordId may appear only once in a batch',
    }),
  deletions: z.array(RECORD_ID).max(HEALTH_BATCH_LIMIT).refine(distinct, {
    message: 'each deleted recordId may appear only once in a batch',
  }),
  grantedTypes: z.array(HEALTH_RECORD_TYPE).refine(distinct, {
    message: 'each granted type may appear only once',
  }),
  source: HEALTH_BATCH_SOURCE,
});

export type HealthBatch = z.infer<typeof HEALTH_BATCH>;

const DAY = z.iso.date();

export const HEALTH_INGEST_RESULT = z.strictObject({
  stored: COUNT,
  stale: COUNT,
  deleted: COUNT,
  days: z.array(DAY),
});

export type HealthIngestResult = z.infer<typeof HEALTH_INGEST_RESULT>;

export interface DayAnchor {
  readonly type: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly zoneOffsetSeconds: number | null;
}

export function localDayOf(anchor: DayAnchor): string {
  const moment =
    anchor.type === 'SleepSession' && anchor.endTime !== null ? anchor.endTime : anchor.startTime;
  const shifted = Date.parse(moment) + (anchor.zoneOffsetSeconds ?? 0) * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

export function affectedDays(anchors: readonly DayAnchor[]): readonly string[] {
  const days = new Set<string>();
  for (const anchor of anchors) {
    days.add(localDayOf(anchor));
  }
  return [...days].sort();
}

const TOKEN_PREFIX = 'hst_';
const TOKEN_BYTES = 32;

export const HEALTH_SOURCE_TOKEN = z.string().regex(/^hst_[0-9a-f]{64}$/);

export function createHealthSourceToken(): string {
  return TOKEN_PREFIX + bytesToHex(randomBytes(TOKEN_BYTES));
}

export function hashHealthSourceToken(token: string): string {
  return bytesToHex(sha256(utf8ToBytes(HEALTH_SOURCE_TOKEN.parse(token))));
}
