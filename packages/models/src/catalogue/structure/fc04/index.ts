import type { ModelSpec } from '@smarteverything/domain';
import { WINDOW_CASEMENT_MODEL } from './casement';
import { SKYLIGHT_MODEL } from './skylight';
import { WINDOW_SLIDING_MODEL } from './sliding';
import { WINDOW_FLOOR_TO_CEILING_MODEL } from './tall';

export {
  SKYLIGHT_MODEL,
  WINDOW_CASEMENT_MODEL,
  WINDOW_FLOOR_TO_CEILING_MODEL,
  WINDOW_SLIDING_MODEL,
};

export const STRUCTURE_WINDOW_MODELS: readonly ModelSpec[] = [
  WINDOW_CASEMENT_MODEL,
  WINDOW_SLIDING_MODEL,
  WINDOW_FLOOR_TO_CEILING_MODEL,
  SKYLIGHT_MODEL,
];
