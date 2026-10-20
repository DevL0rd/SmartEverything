import type { Device } from '../../store/state';
import type { PluginDeviceSearchItem } from '../contract';
import { BOTTLE_WORDS, SETTING_ROWS } from './model/search-rows';

export const BOTTLE_PAGE = 'larq';

export function bottleSearch(_device: Device): readonly PluginDeviceSearchItem[] {
  return SETTING_ROWS.map((row) => ({
    id: row.id,
    title: row.title,
    page: BOTTLE_PAGE,
    focus: row.id,
    keywords: [...BOTTLE_WORDS, ...row.keywords],
    icon: row.icon,
    group: row.group,
  }));
}
