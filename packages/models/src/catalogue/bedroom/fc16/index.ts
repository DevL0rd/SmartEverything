import type { ModelSpec } from '@smarteverything/domain';
import { BED_BENCH_MODEL } from './bench';
import { BEDDING_SET_MODEL } from './bedding';
import { UPHOLSTERED_HEADBOARD_MODEL } from './headboard';
import { FLOOR_MIRROR_MODEL } from './mirror';

export { BED_BENCH_MODEL, BEDDING_SET_MODEL, FLOOR_MIRROR_MODEL, UPHOLSTERED_HEADBOARD_MODEL };

export const BEDROOM_TEXTILE_MODELS: readonly ModelSpec[] = [
  FLOOR_MIRROR_MODEL,
  BED_BENCH_MODEL,
  UPHOLSTERED_HEADBOARD_MODEL,
  BEDDING_SET_MODEL,
];
