import type { ModelSpec } from '@smarteverything/domain';
import { SMART_BOTTLE_MODEL } from './bottle';
import { GENERIC_CHIP_MODEL } from './chip';
import { DESK_ROBOT_MODEL } from './robot';
import { GLASS_SCALE_MODEL } from './scale';
import { ELECTRIC_TOOTHBRUSH_MODEL } from './toothbrush';
import { ROUND_WATCH_MODEL } from './watch';

export {
  DESK_ROBOT_MODEL,
  ELECTRIC_TOOTHBRUSH_MODEL,
  GENERIC_CHIP_MODEL,
  GLASS_SCALE_MODEL,
  ROUND_WATCH_MODEL,
  SMART_BOTTLE_MODEL,
};

export const DEFAULT_PERSONAL_MODELS: readonly ModelSpec[] = [
  GLASS_SCALE_MODEL,
  ROUND_WATCH_MODEL,
  DESK_ROBOT_MODEL,
  SMART_BOTTLE_MODEL,
  ELECTRIC_TOOTHBRUSH_MODEL,
  GENERIC_CHIP_MODEL,
];
