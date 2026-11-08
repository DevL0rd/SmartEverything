import type { Migration } from './migration';

export const OPENROUTER_DEFAULT_MODEL_DROP_MIGRATION: Migration = {
  version: 195,
  name: 'openrouter-default-model-drop',
  statements: [
    `update ai_settings
       set settings = json_remove(settings, '$.default_model', '$.default_effort')
       where key = 'openrouter'
         and (json_type(settings, '$.default_model') is not null
           or json_type(settings, '$.default_effort') is not null)`,
  ],
};
