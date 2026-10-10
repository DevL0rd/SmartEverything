import { UNSET_FITNESS_GOALS } from '@smarteverything/domain';
import { useActiveProfile } from '../../../store/people';
import { goalsOf, type EffectiveFitnessGoals } from '../model/goals';

export function useGoals(): EffectiveFitnessGoals {
  return goalsOf(useActiveProfile()?.fitness_goals ?? UNSET_FITNESS_GOALS);
}

export function useMaxHeartRateSetting(): number | null {
  return useActiveProfile()?.max_heart_rate ?? null;
}
