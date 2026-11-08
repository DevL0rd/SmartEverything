import type { ModelSpec } from '@smarteverything/domain';
import { CURTAINS_MODEL } from './curtains';
import { FLOATING_SHELF_MODEL } from './floating-shelf';
import { THROW_BLANKET_MODEL } from './throw-blanket';
import { THROW_PILLOWS_MODEL } from './throw-pillows';

export { CURTAINS_MODEL, FLOATING_SHELF_MODEL, THROW_BLANKET_MODEL, THROW_PILLOWS_MODEL };

export const DECOR_TEXTILE_MODELS: readonly ModelSpec[] = [
  FLOATING_SHELF_MODEL,
  CURTAINS_MODEL,
  THROW_PILLOWS_MODEL,
  THROW_BLANKET_MODEL,
];
