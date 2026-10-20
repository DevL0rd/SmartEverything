export const TELEVISION_SETTINGS_STATEMENTS: readonly string[] = [
  `create table television_settings (
    device_id text primary key references devices (id) on delete cascade,
    direct_link integer not null default 0 check (direct_link in (0, 1)),
    input_names text not null default '{}' check (json_valid(input_names) and json_type(input_names) = 'object')
  ) strict`,
];

export const TELEVISION_WAKE_COLUMNS: readonly string[] = [
  `alter table television_settings add column wake_macs text not null default '[]' check (json_valid(wake_macs) and json_type(wake_macs) = 'array')`,
  'alter table television_settings add column wake_host text check (wake_host is null or length(wake_host) > 0)',
];

export const TELEVISION_WAKE_RESULT_COLUMNS: readonly string[] = [
  'alter table television_settings add column wake_worked_at text check (wake_worked_at is null or length(wake_worked_at) > 0)',
];

export const TELEVISION_DIRECT_ADDRESS_COLUMNS: readonly string[] = [
  'alter table television_settings drop column direct_link',
  'alter table television_settings drop column wake_host',
  'alter table television_settings add column direct_host text check (direct_host is null or length(direct_host) > 0)',
  'alter table television_settings add column direct_mac text check (direct_mac is null or length(direct_mac) = 17)',
];
