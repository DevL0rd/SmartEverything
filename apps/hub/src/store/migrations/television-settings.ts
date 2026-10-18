export const TELEVISION_SETTINGS_STATEMENTS: readonly string[] = [
  `create table television_settings (
    device_id text primary key references devices (id) on delete cascade,
    direct_link integer not null default 0 check (direct_link in (0, 1)),
    input_names text not null default '{}' check (json_valid(input_names) and json_type(input_names) = 'object')
  ) strict`,
];
