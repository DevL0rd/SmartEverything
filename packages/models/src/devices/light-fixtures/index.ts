import type { ModelSpec } from '@smarteverything/domain';
import { CEILING_ROUND_MODEL } from './ceiling-round';
import { DESK_LAMP_MODEL } from './desk-lamp';
import { PENDANT_MODEL } from './pendant';
import { LIGHT_STRIP_MODEL } from './strip';

export { CEILING_ROUND_MODEL, DESK_LAMP_MODEL, LIGHT_STRIP_MODEL, PENDANT_MODEL };

export const LIGHT_FIXTURE_MODELS: readonly ModelSpec[] = [
  CEILING_ROUND_MODEL,
  PENDANT_MODEL,
  LIGHT_STRIP_MODEL,
  DESK_LAMP_MODEL,
];
