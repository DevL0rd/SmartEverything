import type { ModelSpec } from '@smarteverything/domain';
import { CUTTING_BOARDS_MODEL } from './boards';
import { DISH_RACK_MODEL } from './dish-rack';
import { FRUIT_BOWL_MODEL } from './fruit-bowl';
import { KNIFE_BLOCK_MODEL } from './knife-block';

export { CUTTING_BOARDS_MODEL, DISH_RACK_MODEL, FRUIT_BOWL_MODEL, KNIFE_BLOCK_MODEL };

export const KITCHEN_ACCESSORY_MODELS: readonly ModelSpec[] = [
  DISH_RACK_MODEL,
  KNIFE_BLOCK_MODEL,
  CUTTING_BOARDS_MODEL,
  FRUIT_BOWL_MODEL,
];
