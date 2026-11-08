import type { ModelSpec } from '@smarteverything/domain';
import { DRESSING_TABLE_MODEL } from './dressing';
import { DRESSER_MODEL, NIGHTSTAND_MODEL } from './storage';
import { WARDROBE_MODEL } from './wardrobe';

export { DRESSER_MODEL, DRESSING_TABLE_MODEL, NIGHTSTAND_MODEL, WARDROBE_MODEL };

export const BEDROOM_STORAGE_MODELS: readonly ModelSpec[] = [
  NIGHTSTAND_MODEL,
  DRESSER_MODEL,
  WARDROBE_MODEL,
  DRESSING_TABLE_MODEL,
];
