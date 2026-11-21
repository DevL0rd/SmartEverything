import {
  FITNESS_GOAL_KEYS,
  type FitnessGoals,
  type FitnessSettingsChange,
  type ProfileRow,
} from '@smarteverything/domain';
import { updateFitnessSettings } from '../../../api/health';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { activeProfileIn } from '../../../store/people';

function goalsAfter(goals: FitnessGoals, change: FitnessSettingsChange['goals']): FitnessGoals {
  const next = { ...goals };
  for (const key of FITNESS_GOAL_KEYS) {
    const value = change?.[key];
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

function merged(profile: ProfileRow, change: FitnessSettingsChange): ProfileRow {
  return {
    ...profile,
    fitness_goals: goalsAfter(profile.fitness_goals, change.goals),
    max_heart_rate:
      change.maxHeartRate === undefined ? profile.max_heart_rate : change.maxHeartRate,
  };
}

export async function writeFitnessSettings(
  store: EntityStore,
  change: FitnessSettingsChange,
): Promise<void> {
  const previous = activeProfileIn(store.get());
  await writeOptimistically(store, {
    event: 'fitness_settings.write',
    edits:
      previous === null
        ? []
        : [liveRowEdit('profiles', previous.id, previous, merged(previous, change))],
    send: () => updateFitnessSettings(change),
  });
}
