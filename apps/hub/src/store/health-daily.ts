import {
  HEALTH_METRICS,
  HEALTH_METRIC_UNITS,
  NUTRITION_METRICS,
  type Nutrient,
  type HealthMetric,
  type HealthRecord,
  type HealthRecordType,
} from '@smarteverything/domain';
import { fromPreferredSource } from './health-sources-priority';

export interface DailyFigure {
  readonly metric: HealthMetric;
  readonly value: number;
  readonly unit: string;
}

type RecordOf<T extends HealthRecordType> = Extract<HealthRecord, { type: T }>;

function ofType<T extends HealthRecordType>(
  records: readonly HealthRecord[],
  type: T,
): RecordOf<T>[] {
  return records.filter((record): record is RecordOf<T> => record.type === type);
}

function preferred<T extends HealthRecordType>(
  records: readonly HealthRecord[],
  type: T,
): RecordOf<T>[] {
  return fromPreferredSource(ofType(records, type));
}

function minutesOf(record: HealthRecord): number {
  return record.endTime === null
    ? 0
    : (Date.parse(record.endTime) - Date.parse(record.startTime)) / 60_000;
}

const NUTRIENT_OF_METRIC: readonly (readonly [HealthMetric, Nutrient])[] = [
  ['protein', 'protein'],
  ['carbohydrate', 'totalCarbohydrate'],
  ['fat', 'totalFat'],
  ['fiber', 'dietaryFiber'],
  ['sugar', 'sugar'],
  ['saturated_fat', 'saturatedFat'],
  ['sodium', 'sodium'],
  ['caffeine', 'caffeine'],
];

function nutrition(records: readonly HealthRecord[]): Partial<Record<HealthMetric, number[]>> {
  const meals = preferred(records, 'Nutrition');
  const figures: Partial<Record<HealthMetric, number[]>> = {
    energy_in: meals.flatMap((meal) => meal.data.kilocalories ?? []),
  };
  for (const [metric, nutrient] of NUTRIENT_OF_METRIC) {
    figures[metric] = meals.flatMap((meal) => meal.data.grams[nutrient] ?? []);
  }
  return figures;
}

function amounts(records: readonly HealthRecord[]): Partial<Record<HealthMetric, number[]>> {
  return {
    steps: preferred(records, 'Steps').map((record) => record.data.count),
    distance: preferred(records, 'Distance').map((record) => record.data.meters),
    active_energy: preferred(records, 'ActiveCaloriesBurned').map(
      (record) => record.data.kilocalories,
    ),
    total_energy: preferred(records, 'TotalCaloriesBurned').map(
      (record) => record.data.kilocalories,
    ),
    floors: preferred(records, 'FloorsClimbed').map((record) => record.data.floors),
    hydration: preferred(records, 'Hydration').map((record) => record.data.liters),
    sleep: preferred(records, 'SleepSession').map(minutesOf),
    exercise: preferred(records, 'ExerciseSession').map(minutesOf),
  };
}

interface Span {
  readonly from: number;
  readonly to: number;
}

function workoutSpans(records: readonly HealthRecord[]): Span[] {
  return ofType(records, 'ExerciseSession').map((record) => ({
    from: Date.parse(record.startTime),
    to: Date.parse(record.endTime),
  }));
}

function heartRates(records: readonly HealthRecord[]): { all: number[]; resting: number[] } {
  const spans = workoutSpans(records);
  const samples = preferred(records, 'HeartRate').flatMap((record) => record.data.samples);
  const inWorkout = (time: string): boolean => {
    const at = Date.parse(time);
    return spans.some((span) => at >= span.from && at <= span.to);
  };
  return {
    all: samples.map((sample) => sample.bpm),
    resting: samples.filter((sample) => !inWorkout(sample.time)).map((sample) => sample.bpm),
  };
}

function measures(records: readonly HealthRecord[]): Partial<Record<HealthMetric, number[]>> {
  const heart = heartRates(records);
  return {
    heart_rate_average: heart.resting,
    heart_rate_minimum: heart.resting.length === 0 ? [] : [Math.min(...heart.resting)],
    heart_rate_maximum: heart.all.length === 0 ? [] : [Math.max(...heart.all)],
    resting_heart_rate: preferred(records, 'RestingHeartRate').map((record) => record.data.bpm),
    heart_rate_variability: preferred(records, 'HeartRateVariabilityRmssd').map(
      (record) => record.data.milliseconds,
    ),
    oxygen_saturation: preferred(records, 'OxygenSaturation').map((record) => record.data.percent),
    respiratory_rate: preferred(records, 'RespiratoryRate').map((record) => record.data.rate),
    weight: preferred(records, 'Weight').map((record) => record.data.kilograms),
    vo2_max: preferred(records, 'Vo2Max').map((record) => record.data.mlPerKgPerMin),
  };
}

const SUMMED: ReadonlySet<HealthMetric> = new Set([
  ...NUTRITION_METRICS,
  'steps',
  'distance',
  'active_energy',
  'total_energy',
  'floors',
  'hydration',
  'sleep',
  'exercise',
]);

const LATEST: ReadonlySet<HealthMetric> = new Set(['weight', 'vo2_max']);

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function figureOf(metric: HealthMetric, values: readonly number[]): number {
  if (SUMMED.has(metric)) {
    return sum(values);
  }
  if (LATEST.has(metric)) {
    return values.reduce((_earlier, value) => value);
  }
  return sum(values) / values.length;
}

export function dailyFigures(records: readonly HealthRecord[]): DailyFigure[] {
  const ordered = [...records].sort((left, right) => left.startTime.localeCompare(right.startTime));
  const samples = { ...amounts(ordered), ...measures(ordered), ...nutrition(ordered) };
  return HEALTH_METRICS.flatMap((metric) => {
    const values = samples[metric] ?? [];
    return values.length === 0
      ? []
      : [{ metric, value: figureOf(metric, values), unit: HEALTH_METRIC_UNITS[metric] }];
  });
}
