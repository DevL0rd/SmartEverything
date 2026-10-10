import {
  MAX_HEART_RATE_LIMITS,
  effectiveFitnessGoals,
  type EffectiveFitnessGoals,
  type FitnessGoalKey,
  type FitnessGoals,
} from '@smarteverything/domain';
import { duration } from '../../../format/time';
import { count, kilocalories, litres } from '../../../format/number';

export type { EffectiveFitnessGoals, FitnessGoalKey };

export function goalsOf(goals: FitnessGoals): EffectiveFitnessGoals {
  return effectiveFitnessGoals(goals);
}

export function progressOf(value: number | null, goal: number): number {
  return value === null || goal <= 0 ? 0 : value / goal;
}

export function goalText(key: FitnessGoalKey, value: number): string {
  switch (key) {
    case 'steps':
      return `${count(value)} steps`;
    case 'move_kcal':
      return kilocalories(value);
    case 'active_minutes':
      return `${String(value)} min`;
    case 'sleep_minutes':
      return duration(value * 60);
    case 'hydration_ml':
      return litres(value);
  }
}

export function maxHeartRateFromData(observed: readonly number[]): number | null {
  if (observed.length === 0) {
    return null;
  }
  const highest = Math.round(Math.max(...observed));
  return Math.min(MAX_HEART_RATE_LIMITS.max, Math.max(MAX_HEART_RATE_LIMITS.min, highest));
}
