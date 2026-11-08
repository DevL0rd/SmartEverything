import type { ModelSpec } from '@smarteverything/domain';
import { FLOOR_LAMP_MODEL } from './floor-lamp';
import { LIGHT_BAR_MODEL } from './light-bar';
import { WALL_SCONCE_MODEL } from './wall-sconce';

export { FLOOR_LAMP_MODEL, LIGHT_BAR_MODEL, WALL_SCONCE_MODEL };

export const LIGHT_FIXTURE_2_MODELS: readonly ModelSpec[] = [
  FLOOR_LAMP_MODEL,
  WALL_SCONCE_MODEL,
  LIGHT_BAR_MODEL,
];
