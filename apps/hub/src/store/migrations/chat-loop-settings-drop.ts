import type { Migration } from './migration';

export const CHAT_LOOP_SETTINGS_DROP_MIGRATION: Migration = {
  version: 153,
  name: 'chat-loop-settings-drop',
  statements: [
    `update assistant_settings set settings = json_remove(settings, '$.agent_loops.chat_loop') where json_type(settings, '$.agent_loops.chat_loop') is not null`,
  ],
};
