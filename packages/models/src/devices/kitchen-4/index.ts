import type { ModelSpec } from '@smarteverything/domain';
import { AIR_FRYER_MODEL } from './air-fryer';
import { PET_FEEDER_MODEL } from './pet-feeder';
import { RICE_COOKER_MODEL } from './rice-cooker';

export { AIR_FRYER_MODEL, PET_FEEDER_MODEL, RICE_COOKER_MODEL };

export const KITCHEN_COUNTER_MODELS: readonly ModelSpec[] = [
  RICE_COOKER_MODEL,
  AIR_FRYER_MODEL,
  PET_FEEDER_MODEL,
];
