import type { ModelSpec } from '@smarteverything/domain';
import { BIRD_OF_PARADISE_MODEL } from './bird-of-paradise';
import { BONSAI_MODEL } from './bonsai';
import { ORCHID_MODEL } from './orchid';
import { PEACE_LILY_MODEL } from './peace-lily';
import { SUCCULENT_BOWL_MODEL } from './succulent-bowl';

export {
  BIRD_OF_PARADISE_MODEL,
  BONSAI_MODEL,
  ORCHID_MODEL,
  PEACE_LILY_MODEL,
  SUCCULENT_BOWL_MODEL,
};

export const PLANTS_COMPACT_MODELS: readonly ModelSpec[] = [
  SUCCULENT_BOWL_MODEL,
  BONSAI_MODEL,
  ORCHID_MODEL,
  PEACE_LILY_MODEL,
  BIRD_OF_PARADISE_MODEL,
];
