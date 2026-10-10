import type { HealthRecordType } from '@smarteverything/domain';
import { workoutsOf, type Workout } from '../model/workouts';
import type { Window } from '../model/window';
import { useRecords } from './queries';

const LIST_TYPES: readonly HealthRecordType[] = [
  'ExerciseSession',
  'Distance',
  'ActiveCaloriesBurned',
];

export interface WorkoutList {
  readonly workouts: readonly Workout[];
  readonly loaded: boolean;
  readonly error: Error | null;
}

export function useWorkouts(window: Window): WorkoutList {
  const records = useRecords(LIST_TYPES, window.start, window.end);
  return {
    workouts: workoutsOf(records.data ?? []).filter(
      (workout) => workout.start >= window.start && workout.start < window.end,
    ),
    loaded: records.data !== undefined,
    error: records.error,
  };
}
