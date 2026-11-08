import type { ModelSpec } from '@smarteverything/domain';
import { CHAISE_MODEL } from './chaise';
import { RECLINER_MODEL } from './recliner';
import { SECTIONAL_L_MODEL } from './sectional';
import { ARMCHAIR_MODEL, SOFA_2_SEAT_MODEL, SOFA_3_SEAT_MODEL } from './sofa';

export {
  ARMCHAIR_MODEL,
  CHAISE_MODEL,
  RECLINER_MODEL,
  SECTIONAL_L_MODEL,
  SOFA_2_SEAT_MODEL,
  SOFA_3_SEAT_MODEL,
};

export const LIVING_SEATING_MODELS: readonly ModelSpec[] = [
  SOFA_2_SEAT_MODEL,
  SOFA_3_SEAT_MODEL,
  SECTIONAL_L_MODEL,
  CHAISE_MODEL,
  ARMCHAIR_MODEL,
  RECLINER_MODEL,
];
