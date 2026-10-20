import type { Device } from '../../store/state';
import type { PluginDeviceSearchItem } from '../contract';
import { brandOfModel, brandUi } from './brands';
import { searchRowsOf } from './model/search-index';
import { BRUSH_WORDS } from './model/search-rows';

export const BRUSH_PAGE = 'toothbrush';

export function brushSearch(device: Device): readonly PluginDeviceSearchItem[] {
  const brand = brandOfModel(device.model);
  return searchRowsOf(brand).map((row) => ({
    id: row.id,
    title: row.title,
    page: BRUSH_PAGE,
    focus: row.id,
    keywords: [...BRUSH_WORDS, ...brandUi(brand).keywords, ...row.keywords],
    icon: row.icon,
    group: row.group,
  }));
}
