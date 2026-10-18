export const COMPUTER_NODE_WINDOW_STATEMENTS: readonly string[] = [
  'alter table computer_nodes drop column mcp_token_hash',
  'alter table computer_nodes add column window_client_id text references clients(id) on delete set null',
];
