import type { ModelSpec } from '@smarteverything/domain';
import { ULTRASONIC_DIFFUSER_MODEL } from './diffuser';
import { TOWER_FAN_MODEL } from './fan-tower';
import { GENERIC_HUMIDIFIER_MODEL } from './humidifier';
import { COUNTER_MICROWAVE_MODEL } from './microwave';
import { GENERIC_PURIFIER_MODEL } from './purifier';
import { FRONT_WASHER_MODEL } from './washer-front';

export {
  COUNTER_MICROWAVE_MODEL,
  FRONT_WASHER_MODEL,
  GENERIC_HUMIDIFIER_MODEL,
  GENERIC_PURIFIER_MODEL,
  TOWER_FAN_MODEL,
  ULTRASONIC_DIFFUSER_MODEL,
};

export const CLIMATE_APPLIANCE_MODELS: readonly ModelSpec[] = [
  GENERIC_PURIFIER_MODEL,
  GENERIC_HUMIDIFIER_MODEL,
  ULTRASONIC_DIFFUSER_MODEL,
  TOWER_FAN_MODEL,
  COUNTER_MICROWAVE_MODEL,
  FRONT_WASHER_MODEL,
];
