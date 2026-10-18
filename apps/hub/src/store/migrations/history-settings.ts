import { DEFAULT_HISTORY_SETTINGS } from '@smarteverything/domain';
import { jsonText } from '../sql';

export const HISTORY_SETTINGS_COLUMNS: readonly string[] = [
  `alter table settings add column history_settings text not null default '${jsonText(DEFAULT_HISTORY_SETTINGS)}'
    check (json_valid(history_settings) and json_type(history_settings) = 'object')`,
];
