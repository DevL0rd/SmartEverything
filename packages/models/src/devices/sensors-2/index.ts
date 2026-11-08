import type { ModelSpec } from '@smarteverything/domain';
import { AIR_QUALITY_MONITOR_MODEL } from './air-quality';
import { LEAK_SENSOR_MODEL } from './leak';
import { SMOKE_DETECTOR_MODEL } from './smoke';
import { TEMP_HUMIDITY_MODEL } from './temp-humidity';

export { AIR_QUALITY_MONITOR_MODEL, LEAK_SENSOR_MODEL, SMOKE_DETECTOR_MODEL, TEMP_HUMIDITY_MODEL };

export const SENSOR_2_MODELS: readonly ModelSpec[] = [
  TEMP_HUMIDITY_MODEL,
  LEAK_SENSOR_MODEL,
  SMOKE_DETECTOR_MODEL,
  AIR_QUALITY_MONITOR_MODEL,
];
