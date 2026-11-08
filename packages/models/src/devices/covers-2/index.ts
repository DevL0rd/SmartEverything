import type { ModelSpec } from '@smarteverything/domain';
import { AWNING_MODEL } from './awning';
import { GARAGE_DOOR_MODEL } from './garage-door';
import { GATE_MODEL } from './gate';

export { AWNING_MODEL, GARAGE_DOOR_MODEL, GATE_MODEL };

export const COVER_2_MODELS: readonly ModelSpec[] = [AWNING_MODEL, GARAGE_DOOR_MODEL, GATE_MODEL];
