import type { ModelSpec } from '@smarteverything/domain';
import { DOOR_FRONT_MODEL } from './front';
import { DOOR_DOUBLE_MODEL, DOOR_HINGED_MODEL } from './hinged';
import { DOOR_POCKET_MODEL, DOOR_SLIDING_GLASS_MODEL } from './sliding';

export {
  DOOR_DOUBLE_MODEL,
  DOOR_FRONT_MODEL,
  DOOR_HINGED_MODEL,
  DOOR_POCKET_MODEL,
  DOOR_SLIDING_GLASS_MODEL,
};

export const STRUCTURE_DOOR_MODELS: readonly ModelSpec[] = [
  DOOR_HINGED_MODEL,
  DOOR_DOUBLE_MODEL,
  DOOR_SLIDING_GLASS_MODEL,
  DOOR_POCKET_MODEL,
  DOOR_FRONT_MODEL,
];
