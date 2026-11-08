import type { ModelSpec } from '@smarteverything/domain';
import { GARAGE_CONTROLLER_MODEL } from './garage-controller';
import { INTERCOM_MODEL } from './intercom';

export { GARAGE_CONTROLLER_MODEL, INTERCOM_MODEL };

export const SECURITY_2_MODELS: readonly ModelSpec[] = [GARAGE_CONTROLLER_MODEL, INTERCOM_MODEL];
