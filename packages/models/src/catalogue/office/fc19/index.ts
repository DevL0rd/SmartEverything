import type { ModelSpec } from '@smarteverything/domain';
import { DESK_MODEL } from './desk';
import { GAMING_CHAIR_MODEL } from './gaming-chair';
import { L_DESK_MODEL } from './l-desk';
import { MONITOR_ARM_MODEL } from './monitor-arm';
import { OFFICE_CHAIR_MODEL } from './office-chair';
import { STANDING_DESK_MODEL } from './standing-desk';

export {
  DESK_MODEL,
  GAMING_CHAIR_MODEL,
  L_DESK_MODEL,
  MONITOR_ARM_MODEL,
  OFFICE_CHAIR_MODEL,
  STANDING_DESK_MODEL,
};

export const OFFICE_DESK_MODELS: readonly ModelSpec[] = [
  DESK_MODEL,
  STANDING_DESK_MODEL,
  L_DESK_MODEL,
  OFFICE_CHAIR_MODEL,
  GAMING_CHAIR_MODEL,
  MONITOR_ARM_MODEL,
];
