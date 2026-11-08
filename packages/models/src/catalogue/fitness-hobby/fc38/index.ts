import type { ModelSpec } from '@smarteverything/domain';
import { BICYCLE_MODEL } from './bicycle';
import { EASEL_MODEL } from './easel';
import { MUSIC_STAND_MODEL } from './music-stand';
import { SEWING_TABLE_MODEL } from './sewing-table';

export { BICYCLE_MODEL, EASEL_MODEL, MUSIC_STAND_MODEL, SEWING_TABLE_MODEL };

export const HOBBY_MODELS: readonly ModelSpec[] = [
  BICYCLE_MODEL,
  MUSIC_STAND_MODEL,
  EASEL_MODEL,
  SEWING_TABLE_MODEL,
];
