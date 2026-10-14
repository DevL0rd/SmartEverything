export const COMPUTER_AI_TABLES: readonly string[] = [
  `create table ai_engine_defaults (singleton integer primary key check(singleton = 1), engine text, updated_at text not null) strict`,
  `create table computer_ai (
    device_id text primary key references devices(id) on delete cascade,
    settings text not null, capabilities text, models text not null default '[]', updated_at text not null
  ) strict`,
  `create table computer_nodes (
    device_id text primary key references devices(id) on delete cascade,
    machine_id text not null unique, token_hash text not null unique,
    hub_url text not null, paired_at text not null, revoked_at text, mcp_token_hash text
  ) strict`,
  `create table computer_node_pairings (
    code_hash text primary key, hub_url text not null, expires_at text not null,
    created_by text not null references clients(id) on delete cascade
  ) strict`,
];
