import type { ModelSpec } from '@smarteverything/domain';
import { DISHWASHER_MODEL } from './dishwasher';
import { INDUCTION_HOB_MODEL } from './hob-induction';
import { RANGE_HOOD_MODEL } from './hood-range';
import { WALL_OVEN_MODEL } from './oven-wall';

export { DISHWASHER_MODEL, INDUCTION_HOB_MODEL, RANGE_HOOD_MODEL, WALL_OVEN_MODEL };

export const KITCHEN_APPLIANCE_MODELS: readonly ModelSpec[] = [
  WALL_OVEN_MODEL,
  INDUCTION_HOB_MODEL,
  RANGE_HOOD_MODEL,
  DISHWASHER_MODEL,
];
