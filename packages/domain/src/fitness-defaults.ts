import type { EffectiveFitnessGoals } from './fitness-settings';
import type { BodyFacts } from './profiles';

const OLDER = 65;

export function suggestedGoals(facts: BodyFacts): EffectiveFitnessGoals {
  const older = facts.age >= OLDER;
  const female = facts.sex === 'female';
  return {
    steps: older ? 7000 : 10_000,
    move_kcal: female ? 400 : 500,
    active_minutes: 30,
    sleep_minutes: older ? 450 : 480,
    hydration_ml: female ? 2000 : 2500,
  };
}
