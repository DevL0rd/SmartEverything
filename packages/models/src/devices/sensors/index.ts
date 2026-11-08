import type { ModelSpec } from '@smarteverything/domain';
import { MOTION_PIR_MODEL } from './motion-pir';
import { MULTI_SENSOR_MODEL } from './multi';

export { MOTION_PIR_MODEL, MULTI_SENSOR_MODEL };

export const SENSOR_MODELS: readonly ModelSpec[] = [MULTI_SENSOR_MODEL, MOTION_PIR_MODEL];
