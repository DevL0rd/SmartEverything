import type { ModelSpec } from '@smarteverything/domain';
import { AQUARIUM_STAND_MODEL } from './aquarium-stand';
import { BIRD_CAGE_MODEL } from './bird-cage';
import { CAT_TREE_MODEL } from './cat-tree';
import { PET_CRATE_MODEL } from './pet-crate';

export { AQUARIUM_STAND_MODEL, BIRD_CAGE_MODEL, CAT_TREE_MODEL, PET_CRATE_MODEL };

export const PET_MODELS: readonly ModelSpec[] = [
  CAT_TREE_MODEL,
  PET_CRATE_MODEL,
  AQUARIUM_STAND_MODEL,
  BIRD_CAGE_MODEL,
];
