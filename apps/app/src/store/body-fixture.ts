import {
  UNSET_FITNESS_GOALS,
  bodyComposition,
  type BodyReadingRow,
  type ProfileRow,
} from '@smarteverything/domain';
import type { WeighedReading } from './people';

export const SCALE_DEVICE = '00000000-0000-4000-8000-0000000000a1';
export const DANA = '00000000-0000-4000-8000-0000000000b1';
export const ALEX = '00000000-0000-4000-8000-0000000000b2';

export const LIVE_KG = [88.8, 88.9, 89.2, 87.8, 89.4, 204.7, 10.1, 87.9] as const;

export const NOW = Date.parse('2026-10-18T09:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function momentAgo(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

export function daysAgo(days: number): string {
  return momentAgo(days * DAY);
}

export function hoursAgo(hours: number): string {
  return momentAgo(hours * HOUR);
}

export const COMPOSITION = bodyComposition({
  weightKg: 87.9,
  impedanceLow: 480,
  impedanceHigh: 470,
  sex: 'male',
  age: 36,
  heightCm: 180,
});

let counter = 0;

export function readingOf(
  overrides: Partial<BodyReadingRow> & { weight_kg: number },
): WeighedReading {
  counter += 1;
  const stamp = overrides.measured_at ?? daysAgo(1);
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    device_id: SCALE_DEVICE,
    profile_id: DANA,
    measured_at: stamp,
    impedance_low: null,
    impedance_high: null,
    heart_rate: null,
    scale_user: 1,
    attribution: 'scale',
    bmi: null,
    composition: null,
    version: 1,
    saved_to_health_connect_at: null,
    created_at: stamp,
    updated_at: stamp,
    ...overrides,
  };
}

export function profileOf(id: string, name: string, scaleUser: number | null): ProfileRow {
  return {
    id,
    name,
    colour: 'aqua',
    sex: null,
    birth_date: null,
    height_cm: null,
    scale_user: scaleUser,
    fitness_goals: UNSET_FITNESS_GOALS,
    max_heart_rate: null,
    position: 0,
    created_at: daysAgo(100),
    updated_at: daysAgo(100),
  };
}
