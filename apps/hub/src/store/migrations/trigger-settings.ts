import { DEFAULT_TRIGGER_SETTINGS } from '@smarteverything/domain';
import { jsonText } from '../sql';

export const TRIGGER_SETTINGS_COLUMNS: readonly string[] = [
  `alter table settings add column trigger_settings text not null default '${jsonText(DEFAULT_TRIGGER_SETTINGS)}'
    check (json_valid(trigger_settings) and json_type(trigger_settings) = 'object')`,
];
