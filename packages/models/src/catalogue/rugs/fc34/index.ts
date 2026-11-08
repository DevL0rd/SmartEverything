import type { ModelSpec } from '@smarteverything/domain';
import { RUG_RECTANGLE_MODEL } from './rectangle';
import { JUTE_RUG_MODEL, RUG_ROUND_MODEL } from './round';
import { RUNNER_MODEL } from './runner';
import { BATH_RUG_MODEL, DOOR_MAT_MODEL, OUTDOOR_RUG_MODEL, SHAG_RUG_MODEL } from './soft';

export {
  BATH_RUG_MODEL,
  DOOR_MAT_MODEL,
  JUTE_RUG_MODEL,
  OUTDOOR_RUG_MODEL,
  RUG_RECTANGLE_MODEL,
  RUG_ROUND_MODEL,
  RUNNER_MODEL,
  SHAG_RUG_MODEL,
};

export const RUG_MODELS: readonly ModelSpec[] = [
  RUG_RECTANGLE_MODEL,
  RUG_ROUND_MODEL,
  RUNNER_MODEL,
  SHAG_RUG_MODEL,
  JUTE_RUG_MODEL,
  BATH_RUG_MODEL,
  DOOR_MAT_MODEL,
  OUTDOOR_RUG_MODEL,
];
