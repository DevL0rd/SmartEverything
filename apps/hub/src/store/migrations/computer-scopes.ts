export const COMPUTER_SCOPE_TABLES: readonly string[] = [
  `create table computer_scopes (
    device_id text primary key references devices (id) on delete cascade,
    scopes text not null check (json_valid(scopes) and json_type(scopes) = 'object'),
    updated_at text not null
  ) strict`,
];
