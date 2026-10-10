import { z } from 'zod';

export const WATCH_SPORT_LABELS = {
  treadmill: 'Treadmill',
  indoor_walking: 'Indoor walk',
  outdoor_running: 'Outdoor run',
  walking: 'Walk',
  indoor_cycling: 'Indoor cycling',
  outdoor_cycling: 'Outdoor cycling',
  elliptical: 'Elliptical',
  rowing: 'Rowing machine',
  free_training: 'Free training',
  hiit: 'HIIT',
  yoga: 'Yoga',
  jump_rope: 'Jump rope',
} as const;

export const WATCH_SPORTS = [
  'treadmill',
  'indoor_walking',
  'outdoor_running',
  'walking',
  'indoor_cycling',
  'outdoor_cycling',
  'elliptical',
  'rowing',
  'free_training',
  'hiit',
  'yoga',
  'jump_rope',
] as const;

export const WATCH_SPORT = z.enum(WATCH_SPORTS);

export type WatchSport = z.infer<typeof WATCH_SPORT>;

export const WATCH_WORKOUT_STATES = ['running', 'paused', 'finished'] as const;

const MOMENT = z.iso.datetime({ offset: true });

export const WATCH_WORKOUT = z.strictObject({
  sport: WATCH_SPORT,
  state: z.enum(WATCH_WORKOUT_STATES),
  startedAt: MOMENT,
  endedAt: MOMENT.nullable(),
  pausedAt: MOMENT.nullable(),
  pausedSeconds: z.int().min(0),
  startedFrom: z.enum(['phone', 'watch']),
  heartRate: z.int().min(0).max(255).nullable(),
  kcal: z.int().min(0).nullable(),
  steps: z.int().min(0).nullable(),
  distanceM: z.int().min(0).nullable(),
  updatedAt: MOMENT,
});

export type WatchWorkout = z.infer<typeof WATCH_WORKOUT>;

export const WATCH_WORKOUT_START = z.strictObject({ sport: WATCH_SPORT });

export const WATCH_WORKOUT_REPORT = z.strictObject({
  deviceId: z.uuid(),
  name: z.string().min(1),
  sports: z.array(WATCH_SPORT),
  workout: WATCH_WORKOUT.nullable(),
});

export type WatchWorkoutReport = z.infer<typeof WATCH_WORKOUT_REPORT>;
