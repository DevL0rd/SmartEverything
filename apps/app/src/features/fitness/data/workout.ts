import type { HealthRecord } from '@smarteverything/domain';
import { recordsOfType, type RecordOf } from '../model/records';
import { workoutOf, type Workout } from '../model/workouts';
import { useRecord } from './queries';
import { useRelatedRecords } from './workouts';

export type WorkoutDetail =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly error: Error }
  | { readonly status: 'ready'; readonly workout: Workout };

type Session = RecordOf<'ExerciseSession'>;

function sessionOf(record: HealthRecord | null | undefined): Session | null {
  return record === undefined || record === null
    ? null
    : (recordsOfType([record], 'ExerciseSession')[0] ?? null);
}

export function useWorkoutDetail(recordId: string): WorkoutDetail {
  const record = useRecord(recordId);
  const session = sessionOf(record.data);
  const related = useRelatedRecords(session);
  const error = record.error ?? related.error;
  if (error !== null) {
    return { status: 'failed', error };
  }
  if (record.data === undefined) {
    return { status: 'loading' };
  }
  if (session === null) {
    return { status: 'missing' };
  }
  return related.data === undefined
    ? { status: 'loading' }
    : { status: 'ready', workout: workoutOf(session, related.data) };
}
