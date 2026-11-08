import type { ModelSpec } from '@smarteverything/domain';
import { DOG_BED_MODEL } from './dog-bed';
import { HIGH_CHAIR_MODEL } from './high-chair';
import { KIDS_TABLE_MODEL } from './kids-table';
import { PLAY_MAT_MODEL } from './play-mat';
import { TOY_CHEST_MODEL } from './toy-chest';

export { DOG_BED_MODEL, HIGH_CHAIR_MODEL, KIDS_TABLE_MODEL, PLAY_MAT_MODEL, TOY_CHEST_MODEL };

export const KIDS_ROOM_MODELS: readonly ModelSpec[] = [
  TOY_CHEST_MODEL,
  KIDS_TABLE_MODEL,
  PLAY_MAT_MODEL,
  HIGH_CHAIR_MODEL,
  DOG_BED_MODEL,
];
