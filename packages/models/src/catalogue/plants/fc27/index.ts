import type { ModelSpec } from '@smarteverything/domain';
import { CACTUS_MODEL } from './cactus';
import { FIDDLE_LEAF_FIG_MODEL } from './fiddle-leaf-fig';
import { HANGING_POTHOS_MODEL } from './hanging-pothos';
import { MONSTERA_MODEL } from './monstera';
import { SNAKE_PLANT_MODEL } from './snake-plant';

export {
  CACTUS_MODEL,
  FIDDLE_LEAF_FIG_MODEL,
  HANGING_POTHOS_MODEL,
  MONSTERA_MODEL,
  SNAKE_PLANT_MODEL,
};

export const PLANTS_LEAFY_MODELS: readonly ModelSpec[] = [
  MONSTERA_MODEL,
  FIDDLE_LEAF_FIG_MODEL,
  SNAKE_PLANT_MODEL,
  HANGING_POTHOS_MODEL,
  CACTUS_MODEL,
];
