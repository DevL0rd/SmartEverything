import type { ModelSpec } from '@smarteverything/domain';
import { GALAXY_Z_FOLD7_MODEL } from './fold7';
import { GALAXY_TAB_S9_ULTRA_MODEL } from './tab-s9-ultra';

export { GALAXY_TAB_S9_ULTRA_MODEL, GALAXY_Z_FOLD7_MODEL };

export const PHONE_MODELS: readonly ModelSpec[] = [GALAXY_Z_FOLD7_MODEL, GALAXY_TAB_S9_ULTRA_MODEL];
