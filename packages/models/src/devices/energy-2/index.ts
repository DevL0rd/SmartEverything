import type { ModelSpec } from '@smarteverything/domain';
import { HEAT_PUMP_MODEL } from './heat-pump';
import { SPRINKLER_MODEL } from './sprinkler';
import { WATER_VALVE_MODEL } from './valve';
import { WATER_HEATER_MODEL } from './water-heater';

export { HEAT_PUMP_MODEL, SPRINKLER_MODEL, WATER_HEATER_MODEL, WATER_VALVE_MODEL };

export const ENERGY_2_MODELS: readonly ModelSpec[] = [
  WATER_HEATER_MODEL,
  HEAT_PUMP_MODEL,
  WATER_VALVE_MODEL,
  SPRINKLER_MODEL,
];
