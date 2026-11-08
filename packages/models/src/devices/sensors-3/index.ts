import type { ModelSpec } from '@smarteverything/domain';
import { LIGHT_SENSOR_MODEL } from './light';
import { PLANT_SENSOR_MODEL } from './plant';
import { VIBRATION_SENSOR_MODEL } from './vibration';

export { LIGHT_SENSOR_MODEL, PLANT_SENSOR_MODEL, VIBRATION_SENSOR_MODEL };

export const SENSOR_3_MODELS: readonly ModelSpec[] = [
  VIBRATION_SENSOR_MODEL,
  LIGHT_SENSOR_MODEL,
  PLANT_SENSOR_MODEL,
];
