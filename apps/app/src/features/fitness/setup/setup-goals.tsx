import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  FITNESS_GOAL_KEYS,
  FITNESS_GOAL_LIMITS,
  bodyFactsOf,
  suggestedGoals,
  type FitnessGoals,
  type ProfileRow,
} from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Text } from '../../../components/text';

export type GoalDraft = Record<keyof FitnessGoals, number>;

class GoalsBeforeDetailsError extends Error {
  override readonly name = 'GoalsBeforeDetailsError';

  constructor() {
    super('Goals are suggested from body details, which this profile does not have yet.');
  }
}

export function startingGoals(profile: ProfileRow, now: Date): GoalDraft {
  const facts = bodyFactsOf(profile, now);
  if (facts === null) {
    throw new GoalsBeforeDetailsError();
  }
  const suggested = suggestedGoals(facts);
  const stored = profile.fitness_goals;
  return {
    steps: stored.steps ?? suggested.steps,
    move_kcal: stored.move_kcal ?? suggested.move_kcal,
    active_minutes: stored.active_minutes ?? suggested.active_minutes,
    sleep_minutes: stored.sleep_minutes ?? suggested.sleep_minutes,
    hydration_ml: stored.hydration_ml ?? suggested.hydration_ml,
  };
}

export function SetupGoals({
  goals,
  onGoals,
}: {
  readonly goals: GoalDraft;
  readonly onGoals: (goals: GoalDraft) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Suggested for you. Change any of them now or later in Fitness settings.
      </Text>
      {FITNESS_GOAL_KEYS.map((key) => {
        const limit = FITNESS_GOAL_LIMITS[key];
        return (
          <NumberStepper
            key={key}
            label={limit.label}
            unit={limit.unit}
            min={limit.min}
            max={limit.max}
            step={limit.step}
            value={goals[key]}
            onChange={(value) => {
              onGoals({ ...goals, [key]: value });
            }}
          />
        );
      })}
    </View>
  );
}
