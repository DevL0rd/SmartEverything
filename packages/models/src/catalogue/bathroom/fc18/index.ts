import type { ModelSpec } from '@smarteverything/domain';
import { BATH_MAT_MODEL } from './bath-mat';
import { LAUNDRY_BASKET_MODEL } from './laundry-basket';
import { MIRROR_CABINET_MODEL } from './mirror-cabinet';
import { SHOWER_ENCLOSURE_MODEL } from './shower-enclosure';
import { SHOWER_TRAY_MODEL } from './shower-tray';
import { TOWEL_RAIL_MODEL } from './towel-rail';

export {
  BATH_MAT_MODEL,
  LAUNDRY_BASKET_MODEL,
  MIRROR_CABINET_MODEL,
  SHOWER_ENCLOSURE_MODEL,
  SHOWER_TRAY_MODEL,
  TOWEL_RAIL_MODEL,
};

export const BATHROOM_FITTING_MODELS: readonly ModelSpec[] = [
  SHOWER_ENCLOSURE_MODEL,
  SHOWER_TRAY_MODEL,
  TOWEL_RAIL_MODEL,
  MIRROR_CABINET_MODEL,
  LAUNDRY_BASKET_MODEL,
  BATH_MAT_MODEL,
];
