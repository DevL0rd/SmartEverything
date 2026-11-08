import type { ModelSpec } from '@smarteverything/domain';
import { CANDLE_SET_MODEL } from './candle-set';
import { FRAMED_ART_MODEL } from './framed-art';
import { POSTER_MODEL } from './poster';
import { ROUND_MIRROR_MODEL } from './round-mirror';
import { VASE_MODEL } from './vase';
import { WALL_CLOCK_MODEL } from './wall-clock';

export {
  CANDLE_SET_MODEL,
  FRAMED_ART_MODEL,
  POSTER_MODEL,
  ROUND_MIRROR_MODEL,
  VASE_MODEL,
  WALL_CLOCK_MODEL,
};

export const DECOR_WALL_MODELS: readonly ModelSpec[] = [
  FRAMED_ART_MODEL,
  POSTER_MODEL,
  WALL_CLOCK_MODEL,
  ROUND_MIRROR_MODEL,
  VASE_MODEL,
  CANDLE_SET_MODEL,
];
