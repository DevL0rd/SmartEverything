import type { Migration } from './migration';

export const HARNESS_CHILDREN_DROP_MIGRATION: Migration = {
  version: 151,
  name: 'harness-children-drop',
  statements: [
    'drop table harness_children',
    `update ai_agent_runs set projection = json_remove(projection, '$.harness.operation_id', '$.harness.parent_delivery_id') where json_type(projection, '$.harness') is not null`,
  ],
};
