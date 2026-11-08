import type { ModelSpec } from '@smarteverything/domain';
import { BROOM_CUPBOARD_MODEL } from './cupboard';
import { IRONING_BOARD_MODEL } from './ironing-board';
import { LAUNDRY_SHELVES_MODEL } from './laundry-shelves';
import { STEP_LADDER_MODEL } from './ladder';
import { UTILITY_SINK_MODEL } from './sink';
import { TOOLBOX_MODEL } from './toolbox';

export {
  BROOM_CUPBOARD_MODEL,
  IRONING_BOARD_MODEL,
  LAUNDRY_SHELVES_MODEL,
  STEP_LADDER_MODEL,
  TOOLBOX_MODEL,
  UTILITY_SINK_MODEL,
};

export const STORAGE_UTILITY_MODELS: readonly ModelSpec[] = [
  LAUNDRY_SHELVES_MODEL,
  IRONING_BOARD_MODEL,
  BROOM_CUPBOARD_MODEL,
  TOOLBOX_MODEL,
  STEP_LADDER_MODEL,
  UTILITY_SINK_MODEL,
];
