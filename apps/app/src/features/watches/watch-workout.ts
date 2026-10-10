import { WATCH_SPORTS, WATCH_WORKOUT, type WatchSport, type WatchWorkout } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import type { Device } from '../../store/state';
import { configOf } from './watch-config';
import { usePhoneWatch } from './watch-link';

export const SPORT_ICONS: Readonly<Record<WatchSport, IconName>> = {
  treadmill: 'footprints',
  indoor_walking: 'footprints',
  outdoor_running: 'activity',
  walking: 'footprints',
  indoor_cycling: 'bike',
  outdoor_cycling: 'bike',
  elliptical: 'activity',
  rowing: 'activity',
  free_training: 'dumbbell',
  hiit: 'flame',
  yoga: 'personStanding',
  jump_rope: 'activity',
};

export type WorkoutReading =
  | { readonly kind: 'ready'; readonly workout: WatchWorkout | null }
  | { readonly kind: 'invalid'; readonly reason: string };

export interface WatchWorkoutView {
  readonly sports: readonly WatchSport[];
  readonly reading: WorkoutReading;
}

function readingOf(raw: unknown): WorkoutReading {
  if (raw === undefined || raw === null) {
    return { kind: 'ready', workout: null };
  }
  const parsed = WATCH_WORKOUT.safeParse(raw);
  return parsed.success
    ? { kind: 'ready', workout: parsed.data }
    : { kind: 'invalid', reason: parsed.error.issues.map((issue) => issue.message).join('; ') };
}

function phoneReading(json: string): WorkoutReading {
  try {
    return readingOf(JSON.parse(json));
  } catch (error: unknown) {
    return { kind: 'invalid', reason: error instanceof Error ? error.message : String(error) };
  }
}

const NO_WORKOUT: WatchWorkoutView = { sports: [], reading: { kind: 'ready', workout: null } };

export function useWatchWorkout(watch: Device | null): WatchWorkoutView {
  const phone = usePhoneWatch(watch?.id ?? '');
  if (watch === null) {
    return NO_WORKOUT;
  }
  const config = configOf(watch);
  const offered = config.kind === 'ready' ? config.config.sports : [];
  const json = phone?.workoutJson ?? null;
  return {
    sports: WATCH_SPORTS.filter((sport) => offered.includes(sport)),
    reading: json === null ? readingOf(watch.details['workout']) : phoneReading(json),
  };
}

export function isRunning(view: WatchWorkoutView): boolean {
  const workout = view.reading.kind === 'ready' ? view.reading.workout : null;
  return workout !== null && workout.state !== 'finished';
}

export function elapsedSeconds(workout: WatchWorkout, now: number): number {
  const end =
    workout.state === 'finished' && workout.endedAt !== null
      ? Date.parse(workout.endedAt)
      : workout.pausedAt === null
        ? now
        : Date.parse(workout.pausedAt);
  return Math.max(0, (end - Date.parse(workout.startedAt)) / 1000 - workout.pausedSeconds);
}
