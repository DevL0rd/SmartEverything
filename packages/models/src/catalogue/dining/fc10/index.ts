import type { ModelSpec } from '@smarteverything/domain';
import { BAR_CART_MODEL } from './cart';
import { HIGH_TABLE_MODEL } from './high-table';
import { SIDEBOARD_MODEL } from './sideboard';
import { BAR_STOOL_MODEL } from './stool';

export { BAR_CART_MODEL, BAR_STOOL_MODEL, HIGH_TABLE_MODEL, SIDEBOARD_MODEL };

export const DINING_STORAGE_MODELS: readonly ModelSpec[] = [
  BAR_STOOL_MODEL,
  SIDEBOARD_MODEL,
  BAR_CART_MODEL,
  HIGH_TABLE_MODEL,
];
