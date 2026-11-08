import type { ModelSpec } from '@smarteverything/domain';
import { DUMBBELL_RACK_MODEL } from './dumbbell-rack';
import { PUNCHING_BAG_MODEL } from './punching-bag';
import { WEIGHT_BENCH_MODEL } from './weight-bench';
import { YOGA_MAT_MODEL } from './yoga-mat';

export { DUMBBELL_RACK_MODEL, PUNCHING_BAG_MODEL, WEIGHT_BENCH_MODEL, YOGA_MAT_MODEL };

export const FITNESS_GEAR_MODELS: readonly ModelSpec[] = [
  YOGA_MAT_MODEL,
  DUMBBELL_RACK_MODEL,
  WEIGHT_BENCH_MODEL,
  PUNCHING_BAG_MODEL,
];
