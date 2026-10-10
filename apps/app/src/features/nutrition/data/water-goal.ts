import { FITNESS_GOAL_LIMITS, type ProfileRow } from '@smarteverything/domain';
import { activeProfileIn, useActiveProfile } from '../../../store/people';
import type { StoreState } from '../../../store/state';

export interface WaterGoal {
  readonly ml: number;
  readonly chosen: boolean;
}

function waterGoalOf(profile: ProfileRow | null): WaterGoal {
  const chosen = profile === null ? null : profile.fitness_goals.hydration_ml;
  return chosen === null
    ? { ml: FITNESS_GOAL_LIMITS.hydration_ml.standard, chosen: false }
    : { ml: chosen, chosen: true };
}

export function useWaterGoal(): WaterGoal {
  return waterGoalOf(useActiveProfile());
}

export function waterGoalIn(state: StoreState): WaterGoal {
  return waterGoalOf(activeProfileIn(state));
}
