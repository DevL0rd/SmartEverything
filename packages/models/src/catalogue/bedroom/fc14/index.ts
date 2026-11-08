import type { ModelSpec } from '@smarteverything/domain';
import { KING_BED_MODEL, QUEEN_BED_MODEL, SINGLE_BED_MODEL } from './bed';
import { BUNK_BED_MODEL } from './bunk';
import { CRIB_MODEL } from './crib';

export { BUNK_BED_MODEL, CRIB_MODEL, KING_BED_MODEL, QUEEN_BED_MODEL, SINGLE_BED_MODEL };

export const BEDROOM_BED_MODELS: readonly ModelSpec[] = [
  KING_BED_MODEL,
  QUEEN_BED_MODEL,
  SINGLE_BED_MODEL,
  BUNK_BED_MODEL,
  CRIB_MODEL,
];
