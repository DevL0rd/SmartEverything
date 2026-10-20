import { BRUSH_BRANDS, type BrushBrand } from '@smarteverything/domain';
import { ORALB_ROWS } from '../../oralb/model/search-rows';
import { SONICARE_ROWS } from '../../sonicare/model/search-rows';
import { SHARED_ROWS, type SettingRow } from './search-rows';

export const BRAND_ROWS: Readonly<Record<BrushBrand, readonly SettingRow[]>> = {
  sonicare: SONICARE_ROWS,
  oralb: ORALB_ROWS,
};

export function searchRowsOf(brand: BrushBrand): readonly SettingRow[] {
  return [...SHARED_ROWS, ...BRAND_ROWS[brand]];
}

export const ALL_SEARCH_ROWS: readonly SettingRow[] = [
  ...SHARED_ROWS,
  ...BRUSH_BRANDS.flatMap((brand) => BRAND_ROWS[brand]),
];
