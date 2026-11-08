import type { ModelSpec } from '@smarteverything/domain';
import { ARCHWAY_MODEL } from './archway';
import { BASEBOARD_MODEL, BEAM_MODEL } from './beam';
import { FIREPLACE_MODEL } from './fireplace';
import { FLOOR_SLAB_MODEL, NICHE_MODEL } from './niche';

export {
  ARCHWAY_MODEL,
  BASEBOARD_MODEL,
  BEAM_MODEL,
  FIREPLACE_MODEL,
  FLOOR_SLAB_MODEL,
  NICHE_MODEL,
};

export const STRUCTURE_DETAIL_MODELS: readonly ModelSpec[] = [
  BEAM_MODEL,
  ARCHWAY_MODEL,
  NICHE_MODEL,
  BASEBOARD_MODEL,
  FLOOR_SLAB_MODEL,
  FIREPLACE_MODEL,
];
