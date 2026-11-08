import type { ModelSpec } from '@smarteverything/domain';
import { ALL_IN_ONE_MODEL } from './all-in-one';
import { MINI_PC_MODEL } from './mini-pc';
import { SBC_MODEL } from './sbc';
import { TOWER_MODEL } from './tower';

export { ALL_IN_ONE_MODEL, MINI_PC_MODEL, SBC_MODEL, TOWER_MODEL };

export const COMPUTER_2_MODELS: readonly ModelSpec[] = [
  TOWER_MODEL,
  MINI_PC_MODEL,
  ALL_IN_ONE_MODEL,
  SBC_MODEL,
];
