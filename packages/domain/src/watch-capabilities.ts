import type { CatalogueEntry } from './capabilities';
import { WATCH_WORKOUT_STATES, type WatchWorkout } from './watch-workouts';

const WATCH_WORDS = ['watch', 'smartwatch', 'wrist', 'workout', 'exercise', 'sport'] as const;

export const WATCH_WORKOUT_STATUSES = ['none', ...WATCH_WORKOUT_STATES] as const;

export type WatchWorkoutStatus = (typeof WATCH_WORKOUT_STATUSES)[number];

export const WATCH_WORKOUT_CONTROLS = ['pause', 'resume', 'finish'] as const;

export type WatchWorkoutControl = (typeof WATCH_WORKOUT_CONTROLS)[number];

export const WATCH_CAPABILITY_CATALOGUE = {
  watch_workout: {
    label: 'Workout',
    group: 'fitness',
    kind: 'enum',
    keywords: [...WATCH_WORDS, 'running', 'paused', 'finished', 'tracking'],
  },
  watch_workout_start: {
    label: 'Start workout',
    group: 'fitness',
    kind: 'enum',
    keywords: [...WATCH_WORDS, 'start', 'begin', 'track', 'treadmill', 'run', 'walk'],
  },
  watch_workout_control: {
    label: 'Workout control',
    group: 'fitness',
    kind: 'enum',
    keywords: [...WATCH_WORDS, 'pause', 'resume', 'finish', 'stop', 'end'],
  },
} as const satisfies Record<string, CatalogueEntry>;

export function watchWorkoutStatusOf(workout: WatchWorkout | null): WatchWorkoutStatus {
  return workout === null ? 'none' : workout.state;
}
