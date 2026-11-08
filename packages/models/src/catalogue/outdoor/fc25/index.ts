import type { ModelSpec } from '@smarteverything/domain';
import { HOT_TUB_MODEL } from './hot-tub';
import { LAMP_POST_MODEL } from './lamp-post';
import { POOL_MODEL } from './pool';
import { SWING_MODEL } from './swing';
import { TREE_DECIDUOUS_MODEL } from './tree-deciduous';
import { TREE_PALM_MODEL } from './tree-palm';

export {
  HOT_TUB_MODEL,
  LAMP_POST_MODEL,
  POOL_MODEL,
  SWING_MODEL,
  TREE_DECIDUOUS_MODEL,
  TREE_PALM_MODEL,
};

export const OUTDOOR_FEATURE_MODELS: readonly ModelSpec[] = [
  TREE_DECIDUOUS_MODEL,
  TREE_PALM_MODEL,
  POOL_MODEL,
  HOT_TUB_MODEL,
  SWING_MODEL,
  LAMP_POST_MODEL,
];
