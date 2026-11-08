import type { ModelSpec } from '@smarteverything/domain';
import { FRIDGE_ENCLOSURE_MODEL, OVEN_COLUMN_MODEL } from './appliances';
import { OPEN_SHELF_MODEL, SPICE_RACK_MODEL } from './shelving';

export { FRIDGE_ENCLOSURE_MODEL, OPEN_SHELF_MODEL, OVEN_COLUMN_MODEL, SPICE_RACK_MODEL };

export const KITCHEN_COLUMN_MODELS: readonly ModelSpec[] = [
  OPEN_SHELF_MODEL,
  FRIDGE_ENCLOSURE_MODEL,
  OVEN_COLUMN_MODEL,
  SPICE_RACK_MODEL,
];
