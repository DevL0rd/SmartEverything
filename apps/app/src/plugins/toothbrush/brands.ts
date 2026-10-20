import {
  BRUSH_BRANDS,
  ORALB_MODEL_PREFIX,
  SONICARE_MODEL_PREFIX,
  type BrushBrand,
} from '@smarteverything/domain';
import { ORALB_UI } from '../oralb/brand';
import { SONICARE_UI } from '../sonicare/brand';
import type { BrushBrandRegistry, BrushBrandUi } from './brand-ui';

export const BRAND_UI: BrushBrandRegistry = { sonicare: SONICARE_UI, oralb: ORALB_UI };

export function brandUi(brand: BrushBrand): BrushBrandUi {
  return BRAND_UI[brand];
}

const MODEL_PREFIX: Readonly<Record<BrushBrand, string>> = {
  sonicare: SONICARE_MODEL_PREFIX,
  oralb: ORALB_MODEL_PREFIX,
};

export function brandOfModel(model: string): BrushBrand {
  return BRUSH_BRANDS.find((brand) => model.startsWith(MODEL_PREFIX[brand])) ?? 'sonicare';
}
