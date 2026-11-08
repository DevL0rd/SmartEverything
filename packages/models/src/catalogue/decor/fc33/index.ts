import type { ModelSpec } from '@smarteverything/domain';
import { CHESS_SET_MODEL } from './chess-set';
import { GUITAR_STAND_MODEL } from './guitar-stand';
import { LAMP_SHADE_MODEL } from './lamp-shade';
import { RECORD_PLAYER_MODEL } from './record-player';

export { CHESS_SET_MODEL, GUITAR_STAND_MODEL, LAMP_SHADE_MODEL, RECORD_PLAYER_MODEL };

export const DECOR_HOBBY_MODELS: readonly ModelSpec[] = [
  RECORD_PLAYER_MODEL,
  GUITAR_STAND_MODEL,
  CHESS_SET_MODEL,
  LAMP_SHADE_MODEL,
];
