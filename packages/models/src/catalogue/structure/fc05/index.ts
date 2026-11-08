import type { ModelSpec } from '@smarteverything/domain';
import { BALCONY_RAILING_MODEL } from './balcony-railing';
import { STAIRS_L_MODEL } from './lshape';
import { RADIATOR_MODEL } from './radiator';
import { STAIR_RAILING_MODEL } from './stair-railing';
import { STAIRS_STRAIGHT_MODEL } from './straight';

export {
  BALCONY_RAILING_MODEL,
  RADIATOR_MODEL,
  STAIR_RAILING_MODEL,
  STAIRS_L_MODEL,
  STAIRS_STRAIGHT_MODEL,
};

export const STRUCTURE_STAIR_MODELS: readonly ModelSpec[] = [
  STAIRS_STRAIGHT_MODEL,
  STAIRS_L_MODEL,
  STAIR_RAILING_MODEL,
  BALCONY_RAILING_MODEL,
  RADIATOR_MODEL,
];
