import type { Migration } from './migration';

export const HARNESS_CONTEXT_REQUEST_MIGRATION: Migration = {
  version: 149,
  name: 'harness-context-request',
  statements: [
    `update harness_projections set projection = json_remove(projection, '$.context_request') where json_type(projection, '$.context_request') is not null`,
  ],
};
