import type { Device } from '../../store/state';
import type { PluginDeviceSearchItem } from '../contract';
import { SETTING_ROWS, TREADMILL_WORDS } from './model/search-rows';

export const TREADMILL_PAGE = 'treadmill';

export function treadmillSearch(_device: Device): readonly PluginDeviceSearchItem[] {
  return SETTING_ROWS.map((row) => ({
    id: row.id,
    title: row.title,
    page: TREADMILL_PAGE,
    focus: row.id,
    keywords: [...TREADMILL_WORDS, ...row.keywords],
    icon: row.icon,
    group: row.group,
  }));
}
