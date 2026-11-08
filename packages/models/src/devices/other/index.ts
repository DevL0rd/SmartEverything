import type { ModelSpec } from '@smarteverything/domain';
import { AQUARIUM_MODEL } from './aquarium';
import { LITTER_BOX_MODEL } from './litter-box';
import { POOL_PUMP_MODEL } from './pool-pump';
import { SLEEP_SENSOR_MODEL } from './sleep-sensor';

export { AQUARIUM_MODEL, LITTER_BOX_MODEL, POOL_PUMP_MODEL, SLEEP_SENSOR_MODEL };

export const OTHER_MODELS: readonly ModelSpec[] = [
  POOL_PUMP_MODEL,
  LITTER_BOX_MODEL,
  AQUARIUM_MODEL,
  SLEEP_SENSOR_MODEL,
];
