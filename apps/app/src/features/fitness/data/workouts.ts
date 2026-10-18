import type { HealthRecordType } from '@smarteverything/domain';
import { endOf, recordsOfType, startOf, type RecordOf } from '../model/records';
import { DAY_MS, startOfDayKey } from '../../../format/time';
import { workoutOf, type Workout } from '../model/workouts';
import { useRecords } from './queries';

const WORKOUT_RELATED: readonly HealthRecordType[] = [
  'HeartRate',
  'Distance',
  'ActiveCaloriesBurned',
];

const LATEST_WINDOW_DAYS = 30;

type Session = RecordOf<'ExerciseSession'>;

export interface WorkoutRead {
  readonly workout: Workout | null;
  readonly loaded: boolean;
  readonly error: Error | null;
}

export function useLatestWorkout(day: string): WorkoutRead {
  const end = startOfDayKey(day) + DAY_MS;
  const sessions = useRecords(['ExerciseSession'], end - LATEST_WINDOW_DAYS * DAY_MS, end);
  const latest = recordsOfType(sessions.data ?? [], 'ExerciseSession').reduce<Session | null>(
    (found, session) => (found === null || startOf(session) > startOf(found) ? session : found),
    null,
  );
  return useWorkoutOf(latest, sessions.data !== undefined, sessions.error);
}

export function useRelatedRecords(session: Session | null): ReturnType<typeof useRecords> {
  return useRecords(
    session === null ? [] : WORKOUT_RELATED,
    session === null ? 0 : startOf(session),
    session === null ? 0 : endOf(session),
  );
}

function useWorkoutOf(session: Session | null, loaded: boolean, error: Error | null): WorkoutRead {
  const related = useRelatedRecords(session);
  if (session === null) {
    return { workout: null, loaded, error };
  }
  return {
    workout: workoutOf(session, related.data ?? []),
    loaded: loaded && related.data !== undefined,
    error: error ?? related.error,
  };
}
