import type { Device } from '../../store/state';
import type { PluginDeviceSearchItem } from '../contract';
import { PRINTER_WORDS, SETTING_ROWS } from './model/search-rows';

export const PRINTER_PAGE = 'printer';

export function printerSearch(_device: Device): readonly PluginDeviceSearchItem[] {
  return SETTING_ROWS.map((row) => ({
    id: row.id,
    title: row.title,
    page: PRINTER_PAGE,
    focus: row.id,
    keywords: [...PRINTER_WORDS, ...row.keywords],
    icon: row.icon,
    group: row.group,
  }));
}
