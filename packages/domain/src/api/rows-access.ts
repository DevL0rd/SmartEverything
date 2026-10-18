import { z } from 'zod';
import { HEALTH_RECORD_TYPE } from '../health';
import { DAY, ID, MOMENT, boundedText } from './primitives';

export const HEALTH_METRICS = [
  'steps',
  'distance',
  'active_energy',
  'total_energy',
  'floors',
  'hydration',
  'sleep',
  'exercise',
  'heart_rate_average',
  'heart_rate_minimum',
  'heart_rate_maximum',
  'resting_heart_rate',
  'heart_rate_variability',
  'oxygen_saturation',
  'respiratory_rate',
  'weight',
  'vo2_max',
  'energy_in',
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
  'sugar',
  'saturated_fat',
  'sodium',
  'caffeine',
  'stress_average',
  'stress_maximum',
  'vitality',
] as const;

export type HealthMetric = (typeof HEALTH_METRICS)[number];

export const HEALTH_METRIC_UNITS: Readonly<Record<HealthMetric, string>> = {
  steps: 'count',
  distance: 'm',
  active_energy: 'kcal',
  total_energy: 'kcal',
  floors: 'count',
  hydration: 'l',
  sleep: 'min',
  exercise: 'min',
  heart_rate_average: 'bpm',
  heart_rate_minimum: 'bpm',
  heart_rate_maximum: 'bpm',
  resting_heart_rate: 'bpm',
  heart_rate_variability: 'ms',
  oxygen_saturation: '%',
  respiratory_rate: 'rpm',
  weight: 'kg',
  vo2_max: 'ml/kg/min',
  energy_in: 'kcal',
  protein: 'g',
  carbohydrate: 'g',
  fat: 'g',
  fiber: 'g',
  sugar: 'g',
  saturated_fat: 'g',
  sodium: 'g',
  caffeine: 'g',
  stress_average: 'score',
  stress_maximum: 'score',
  vitality: 'score',
};

export const NUTRITION_METRICS: ReadonlySet<HealthMetric> = new Set([
  'energy_in',
  'protein',
  'carbohydrate',
  'fat',
  'fiber',
  'sugar',
  'saturated_fat',
  'sodium',
  'caffeine',
]);

export const WATCH_METRICS: ReadonlySet<HealthMetric> = new Set([
  'stress_average',
  'stress_maximum',
  'vitality',
]);

export const HEALTH_METRIC = z.enum(HEALTH_METRICS);

export const HEALTH_DAILY_ROW = z.object({
  profile_id: ID.nullable().default(null),
  day: DAY,
  metric: HEALTH_METRIC,
  value: z.number(),
  unit: z.string().min(1),
  updated_at: MOMENT,
});

export type HealthDailyRow = z.infer<typeof HEALTH_DAILY_ROW>;

export const HEALTH_SOURCE_NAME = boundedText(80);

export const HEALTH_SOURCE_ROW = z.object({
  client_id: ID,
  name: HEALTH_SOURCE_NAME,
  granted_types: z.array(HEALTH_RECORD_TYPE),
  last_sync_at: MOMENT.nullable(),
  last_error: z.string().nullable(),
  created_at: MOMENT,
});

export type HealthSourceRow = z.infer<typeof HEALTH_SOURCE_ROW>;

export const TOKEN_NAME = boundedText(80);

export const MCP_TOKEN_ROW = z.object({
  id: ID,
  name: TOKEN_NAME,
  created_at: MOMENT,
  last_used_at: MOMENT.nullable(),
  revoked_at: MOMENT.nullable(),
});

export type McpTokenRow = z.infer<typeof MCP_TOKEN_ROW>;

export const OAUTH_CLIENT_ROW = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  uri: z.url().nullable(),
  logo_uri: z.url().nullable(),
  redirect_uris: z.array(z.url()).min(1),
  scopes: z.array(z.string().min(1)),
  created_at: MOMENT,
  granted_at: MOMENT.nullable(),
  revoked_at: MOMENT.nullable(),
});

export type OAuthClientRow = z.infer<typeof OAUTH_CLIENT_ROW>;
