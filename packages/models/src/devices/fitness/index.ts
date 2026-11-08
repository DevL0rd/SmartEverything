import type { ModelSpec } from '@smarteverything/domain';
import { EXERCISE_BIKE_MODEL } from './exercise-bike';
import { ROWER_MODEL } from './rower';
import { GENERIC_TREADMILL_MODEL } from './treadmill-generic';
import { WALKING_PAD_MODEL } from './walking-pad';

export { EXERCISE_BIKE_MODEL, GENERIC_TREADMILL_MODEL, ROWER_MODEL, WALKING_PAD_MODEL };

export const FITNESS_MODELS: readonly ModelSpec[] = [
  GENERIC_TREADMILL_MODEL,
  WALKING_PAD_MODEL,
  EXERCISE_BIKE_MODEL,
  ROWER_MODEL,
];
