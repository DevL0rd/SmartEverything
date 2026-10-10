import { z } from 'zod';

export const FITNESS_GOAL_KEYS = [
  'steps',
  'move_kcal',
  'active_minutes',
  'sleep_minutes',
  'hydration_ml',
] as const;

export type FitnessGoalKey = (typeof FITNESS_GOAL_KEYS)[number];

export interface FitnessGoalLimit {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly standard: number;
}

export const FITNESS_GOAL_LIMITS: Readonly<Record<FitnessGoalKey, FitnessGoalLimit>> = {
  steps: { label: 'Steps', unit: 'steps', min: 1000, max: 50_000, step: 500, standard: 10_000 },
  move_kcal: { label: 'Move', unit: 'kcal', min: 50, max: 3000, step: 50, standard: 500 },
  active_minutes: { label: 'Active minutes', unit: 'min', min: 5, max: 300, step: 5, standard: 30 },
  sleep_minutes: { label: 'Sleep', unit: 'min', min: 240, max: 720, step: 15, standard: 480 },
  hydration_ml: { label: 'Hydration', unit: 'ml', min: 500, max: 6000, step: 250, standard: 2000 },
};

function goalOf(key: FitnessGoalKey): z.ZodNullable<z.ZodNumber> {
  const limit = FITNESS_GOAL_LIMITS[key];
  return z.number().min(limit.min).max(limit.max).multipleOf(limit.step).nullable();
}

export const FITNESS_GOALS = z.strictObject({
  steps: goalOf('steps'),
  move_kcal: goalOf('move_kcal'),
  active_minutes: goalOf('active_minutes'),
  sleep_minutes: goalOf('sleep_minutes'),
  hydration_ml: goalOf('hydration_ml'),
});

export type FitnessGoals = z.infer<typeof FITNESS_GOALS>;

export const UNSET_FITNESS_GOALS: FitnessGoals = {
  steps: null,
  move_kcal: null,
  active_minutes: null,
  sleep_minutes: null,
  hydration_ml: null,
};

export type EffectiveFitnessGoals = Readonly<Record<FitnessGoalKey, number>>;

export function effectiveFitnessGoals(goals: FitnessGoals): EffectiveFitnessGoals {
  return {
    steps: goals.steps ?? FITNESS_GOAL_LIMITS.steps.standard,
    move_kcal: goals.move_kcal ?? FITNESS_GOAL_LIMITS.move_kcal.standard,
    active_minutes: goals.active_minutes ?? FITNESS_GOAL_LIMITS.active_minutes.standard,
    sleep_minutes: goals.sleep_minutes ?? FITNESS_GOAL_LIMITS.sleep_minutes.standard,
    hydration_ml: goals.hydration_ml ?? FITNESS_GOAL_LIMITS.hydration_ml.standard,
  };
}

export const MAX_HEART_RATE_LIMITS = { min: 120, max: 220, step: 1 } as const;

export const MAX_HEART_RATE = z.int().min(MAX_HEART_RATE_LIMITS.min).max(MAX_HEART_RATE_LIMITS.max);

export const FITNESS_SETTINGS_CHANGE = z
  .strictObject({
    goals: FITNESS_GOALS.partial(),
    maxHeartRate: MAX_HEART_RATE.nullable(),
  })
  .partial()
  .refine((change) => Object.keys(change).length > 0, {
    message: 'name at least one field to change',
  });

export type FitnessSettingsChange = z.infer<typeof FITNESS_SETTINGS_CHANGE>;
