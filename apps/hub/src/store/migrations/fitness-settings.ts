import {
  FITNESS_GOALS,
  MAX_HEART_RATE,
  MAX_HEART_RATE_LIMITS,
  UNSET_FITNESS_GOALS,
  type FitnessGoalKey,
  type FitnessGoals,
} from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';

export const FITNESS_SETTINGS_COLUMNS: readonly string[] = [
  `alter table settings add column fitness_goals text not null default '${jsonText(UNSET_FITNESS_GOALS)}'
    check (json_valid(fitness_goals) and json_type(fitness_goals) = 'object')`,
  `alter table settings add column max_heart_rate integer
    check (max_heart_rate between ${String(MAX_HEART_RATE_LIMITS.min)} and ${String(MAX_HEART_RATE_LIMITS.max)})`,
];

const LEGACY_ROW = z.object({ layout: SQL_JSON });

const LEGACY_FITNESS_SETTINGS_PAGE = 'fitness_settings';

const LEGACY_FITNESS_SETTINGS = z.object({
  goals: z
    .object({
      steps: z.number(),
      activeEnergy: z.number(),
      exerciseMinutes: z.number(),
      sleepMinutes: z.number(),
      hydrationLiters: z.number(),
    })
    .partial()
    .optional(),
  maxHeartRate: z.number().nullable().optional(),
});

function legacyGoal(key: FitnessGoalKey, value: number | undefined): number | null {
  const parsed = FITNESS_GOALS.shape[key].safeParse(value);
  return parsed.success ? parsed.data : null;
}

interface LegacyFitnessSettings {
  readonly goals: FitnessGoals;
  readonly maxHeartRate: number | null;
}

function legacyFitnessSettings(stored: unknown): LegacyFitnessSettings | null {
  const parsed = LEGACY_FITNESS_SETTINGS.safeParse(stored);
  if (!parsed.success) {
    return null;
  }
  const goals = parsed.data.goals ?? {};
  const hydration = goals.hydrationLiters;
  const heart = MAX_HEART_RATE.safeParse(parsed.data.maxHeartRate);
  return {
    goals: {
      steps: legacyGoal('steps', goals.steps),
      move_kcal: legacyGoal('move_kcal', goals.activeEnergy),
      active_minutes: legacyGoal('active_minutes', goals.exerciseMinutes),
      sleep_minutes: legacyGoal('sleep_minutes', goals.sleepMinutes),
      hydration_ml: legacyGoal(
        'hydration_ml',
        hydration === undefined ? undefined : hydration * 1000,
      ),
    },
    maxHeartRate: heart.success ? heart.data : null,
  };
}

export function moveLegacyFitnessSettings(sql: Sql): LogPayload {
  const rows = sql.all(
    LEGACY_ROW,
    'select layout from layouts where page = $page order by updated_at desc',
    { page: LEGACY_FITNESS_SETTINGS_PAGE },
  );
  const legacy = rows
    .map((row) => legacyFitnessSettings(row.layout))
    .find((settings) => settings !== null);
  if (legacy === undefined) {
    return { legacyRows: rows.length, moved: false };
  }
  sql.run(
    'move the fitness settings',
    'update settings set fitness_goals = $goals, max_heart_rate = $maxHeartRate where id = 1',
    { goals: jsonText(legacy.goals), maxHeartRate: legacy.maxHeartRate },
  );
  return { legacyRows: rows.length, moved: true };
}
