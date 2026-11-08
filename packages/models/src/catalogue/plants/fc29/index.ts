import type { ModelSpec } from '@smarteverything/domain';
import { ARECA_PALM_MODEL } from './areca-palm';
import { BAMBOO_MODEL } from './bamboo';
import { FLOWER_VASE_MODEL } from './flower-vase';
import { HERB_POTS_MODEL } from './herb-pots';
import { OLIVE_TREE_MODEL } from './olive-tree';

export { ARECA_PALM_MODEL, BAMBOO_MODEL, FLOWER_VASE_MODEL, HERB_POTS_MODEL, OLIVE_TREE_MODEL };

export const PLANTS_TREE_MODELS: readonly ModelSpec[] = [
  OLIVE_TREE_MODEL,
  HERB_POTS_MODEL,
  ARECA_PALM_MODEL,
  BAMBOO_MODEL,
  FLOWER_VASE_MODEL,
];
