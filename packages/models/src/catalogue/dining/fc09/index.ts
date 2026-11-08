import type { ModelSpec } from '@smarteverything/domain';
import { DINING_BENCH_MODEL } from './bench';
import { DINING_CHAIR_MODEL } from './chair';
import { DINING_TABLE_RECTANGLE_MODEL, DINING_TABLE_ROUND_MODEL } from './tables';

export {
  DINING_BENCH_MODEL,
  DINING_CHAIR_MODEL,
  DINING_TABLE_RECTANGLE_MODEL,
  DINING_TABLE_ROUND_MODEL,
};

export const DINING_TABLE_MODELS: readonly ModelSpec[] = [
  DINING_TABLE_RECTANGLE_MODEL,
  DINING_TABLE_ROUND_MODEL,
  DINING_CHAIR_MODEL,
  DINING_BENCH_MODEL,
];
