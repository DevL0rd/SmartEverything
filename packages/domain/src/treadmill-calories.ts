import { gradeOf, type InclineScale } from './treadmill-incline';

const METRES_PER_KM = 1000;

const MINUTES_PER_HOUR = 60;

const RESTING_VO2 = 3.5;

const KCAL_PER_VO2_KG_MINUTE = 200;

const WALKING_SPEED_TERM = 0.1;

const WALKING_GRADE_TERM = 1.8;

const RUNNING_SPEED_TERM = 0.2;

const RUNNING_GRADE_TERM = 0.9;

export const DEFAULT_GRADE_PERCENT = 4;

export const DEFAULT_RUN_SWITCH_KMH = 8;

export interface CalorieInput {
  readonly speedKmh: number;
  readonly gradePercent: number;
  readonly weightKg: number;
  readonly runSwitchKmh: number;
}

export interface CalorieRate {
  readonly grossPerMinute: number;
  readonly netPerMinute: number;
  readonly met: number;
}

export function calorieRate(input: CalorieInput): CalorieRate {
  const metresPerMinute = (input.speedKmh * METRES_PER_KM) / MINUTES_PER_HOUR;
  const grade = input.gradePercent / 100;
  const running = input.speedKmh > input.runSwitchKmh;
  const speedTerm = running ? RUNNING_SPEED_TERM : WALKING_SPEED_TERM;
  const gradeTerm = running ? RUNNING_GRADE_TERM : WALKING_GRADE_TERM;
  const vo2 = speedTerm * metresPerMinute + gradeTerm * metresPerMinute * grade + RESTING_VO2;
  return {
    grossPerMinute: (vo2 * input.weightKg) / KCAL_PER_VO2_KG_MINUTE,
    netPerMinute: ((vo2 - RESTING_VO2) * input.weightKg) / KCAL_PER_VO2_KG_MINUTE,
    met: vo2 / RESTING_VO2,
  };
}

export function metOf(grossKcal: number, weightKg: number, activeSeconds: number): number | null {
  const hours = activeSeconds / (MINUTES_PER_HOUR * MINUTES_PER_HOUR);
  return hours > 0 && weightKg > 0 ? grossKcal / (weightKg * hours) : null;
}

export const KCAL_SOURCES = ['belt', 'estimate'] as const;

export type KcalSource = (typeof KCAL_SOURCES)[number];

export interface EnergySample {
  readonly t: number;
  readonly kmh: number;
  readonly incline: number | null;
  readonly state: 'running' | 'paused';
}

export interface EnergyInput {
  readonly scale: InclineScale;
  readonly weightKg: number;
  readonly runSwitchKmh: number;
  readonly fixedGradePercent: number | null;
}

export interface Energy {
  readonly kcal: number;
  readonly kcalNet: number;
}

export function estimateEnergy(samples: readonly EnergySample[], input: EnergyInput): Energy {
  let kcal = 0;
  let kcalNet = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    if (before === undefined || after === undefined || before.state !== 'running') {
      continue;
    }
    const gradePercent =
      before.incline === null
        ? (input.fixedGradePercent ?? 0)
        : gradeOf(before.incline, input.scale);
    const rate = calorieRate({ ...input, speedKmh: before.kmh, gradePercent });
    const minutes = Math.max(after.t - before.t, 0) / MINUTES_PER_HOUR;
    kcal += rate.grossPerMinute * minutes;
    kcalNet += rate.netPerMinute * minutes;
  }
  return { kcal, kcalNet };
}

export function energySourceOf(
  beltKcal: number | null | undefined,
  estimateKcal: number,
): { readonly kcal: number; readonly source: KcalSource } {
  return beltKcal !== null && beltKcal !== undefined && beltKcal > 0
    ? { kcal: beltKcal, source: 'belt' }
    : { kcal: estimateKcal, source: 'estimate' };
}
