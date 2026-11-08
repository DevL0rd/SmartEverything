import type { Migration } from './migration';

export const HELPER_DELETE_ACTION_MIGRATION: Migration = {
  version: 156,
  name: 'helper-delete-action',
  statements: [
    `update ai_agent_runs set projection = json_set(projection, '$.supported_actions', json_array('open_chat', 'delete'))
     where json_extract(projection, '$.source') = 'smarteverything'
       and json_extract(projection, '$.child_chat_id') is not null
       and state in ('completed', 'stopped', 'interrupted', 'failed')`,
  ],
};
