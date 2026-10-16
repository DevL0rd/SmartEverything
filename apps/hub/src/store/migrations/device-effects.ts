export const DEVICE_EFFECT_TABLES = [
  `create table device_effect_targets (
    device_id text not null references devices(id) on delete cascade,
    capability text not null, base text not null, resolved text not null,
    generation integer not null, effects text not null, command_id text, updated_at text not null,
    primary key(device_id, capability)
  ) strict`,
  `create table device_effect_commands (
    command_id text primary key references commands(id) on delete cascade,
    device_id text not null, capability text not null, generation integer not null, generated integer not null,
    base text not null, value text not null, effect_ids text not null
  ) strict`,
  "alter table commands add column effect_policy text not null default 'keep'",
] as const;
