import type { ModelSpec } from '@smarteverything/domain';
import { GARDEN_BENCH_MODEL } from './bench';
import { FENCE_PANEL_MODEL } from './fence';
import { HEDGE_MODEL } from './hedge';
import { PATH_STONES_MODEL } from './stones';
import { PLANTER_BOX_MODEL } from './planter';
import { RAISED_BED_MODEL } from './raised-bed';

export {
  FENCE_PANEL_MODEL,
  GARDEN_BENCH_MODEL,
  HEDGE_MODEL,
  PATH_STONES_MODEL,
  PLANTER_BOX_MODEL,
  RAISED_BED_MODEL,
};

export const OUTDOOR_GARDEN_MODELS: readonly ModelSpec[] = [
  PLANTER_BOX_MODEL,
  RAISED_BED_MODEL,
  FENCE_PANEL_MODEL,
  HEDGE_MODEL,
  PATH_STONES_MODEL,
  GARDEN_BENCH_MODEL,
];
