import { Logger } from '@smarteverything/logging';
import {
  FITNESS_GOAL_KEYS,
  type FitnessGoals,
  type FitnessSettingsChange,
  type ProfileRow,
} from '@smarteverything/domain';
import { updateFitnessSettings } from '../../../api/health';
import type { EntityStore } from '../../../store/entity-store';
import { applyChange } from '../../../store/live-reducers';
import type { StoreState } from '../../../store/state';
import { activeProfileIn } from '../../../store/people';

const log = new Logger('app.fitness');
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

function withProfile(state: StoreState, profile: ProfileRow): StoreState {
  return applyChange(state, {
    type: 'change',
    table: 'profiles',
    operation: 'UPDATE',
    record: profile,
    oldRecord: null,
  });
}

export async function writeFitnessSettings(
  store: EntityStore,
  change: FitnessSettingsChange,
): Promise<void> {
  const previous = activeProfileIn(store.get());
  const operation = log.operation('fitness_settings.write', {
    goalKeys: Object.keys(change.goals ?? {}).join(','),
    maxHeartRate: change.maxHeartRate !== undefined,
    optimistic: previous !== null,
  });
  if (previous !== null) {
    store.update((state) => withProfile(state, merged(previous, change)));
  }
  try {
    await updateFitnessSettings(change);
    operation.succeeded();
  } catch (error) {
    operation.failed(error, { rolledBack: previous !== null });
    if (previous !== null) {
      store.update((state) => withProfile(state, previous));
    }
    throw error;
  }
}
