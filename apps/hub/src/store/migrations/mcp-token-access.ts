import type { Migration } from './migration';

export const MCP_TOKEN_ACCESS_MIGRATION: Migration = {
  version: 136,
  name: 'mcp_token_access',
  statements: [
    `alter table mcp_tokens add column access text not null default 'control'
      check (access in ('read', 'control'))`,
  ],
};
