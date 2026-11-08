import type { ModelSpec } from '@smarteverything/domain';
import { BULB_A60_MODEL } from './bulb-a60';
import { REMOTE_4KEY_MODEL } from './remote-4key';
import { ROLLER_BLIND_MODEL } from './roller-blind';
import { WALL_ROCKER_MODEL } from './wall-rocker';

export { BULB_A60_MODEL, REMOTE_4KEY_MODEL, ROLLER_BLIND_MODEL, WALL_ROCKER_MODEL };

export const HOME_BASIC_MODELS: readonly ModelSpec[] = [
  BULB_A60_MODEL,
  WALL_ROCKER_MODEL,
  REMOTE_4KEY_MODEL,
  ROLLER_BLIND_MODEL,
];
