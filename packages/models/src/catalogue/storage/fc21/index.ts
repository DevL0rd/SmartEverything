import type { ModelSpec } from '@smarteverything/domain';
import { HALLWAY_BENCH_MODEL } from './bench';
import { STORAGE_BOXES_MODEL } from './boxes';
import { COAT_RACK_MODEL } from './coat-rack';
import { CONSOLE_TABLE_MODEL } from './console';
import { SHELVING_UNIT_MODEL } from './shelving';
import { SHOE_RACK_MODEL } from './shoe-rack';

export {
  COAT_RACK_MODEL,
  CONSOLE_TABLE_MODEL,
  HALLWAY_BENCH_MODEL,
  SHELVING_UNIT_MODEL,
  SHOE_RACK_MODEL,
  STORAGE_BOXES_MODEL,
};

export const STORAGE_HALL_MODELS: readonly ModelSpec[] = [
  SHELVING_UNIT_MODEL,
  STORAGE_BOXES_MODEL,
  SHOE_RACK_MODEL,
  COAT_RACK_MODEL,
  HALLWAY_BENCH_MODEL,
  CONSOLE_TABLE_MODEL,
];
