import type { ModelSpec } from '@smarteverything/domain';
import { DEADBOLT_LOCK_MODEL } from './lock';
import { SMART_PLUG_MODEL } from './plug';

export { DEADBOLT_LOCK_MODEL, SMART_PLUG_MODEL };

export const ACCESS_MODELS: readonly ModelSpec[] = [SMART_PLUG_MODEL, DEADBOLT_LOCK_MODEL];
