export const DEVICE_EFFECT_ROW_STATEMENTS: readonly string[] = [
  `create table device_effect_controls (
    device_id text not null references devices(id) on delete cascade,
    capability text not null, base text not null, resolved text not null, updated_at text not null,
    primary key(device_id, capability)
  ) strict`,
  `create table device_effects (
    id text primary key, device_id text not null, capability text not null,
    operation text not null, priority integer not null, ordinal integer not null,
    run_id text not null, node_id text not null, expires_at text not null,
    foreign key(device_id, capability) references device_effect_controls(device_id, capability) on delete cascade
  ) strict`,
  'create index device_effects_control on device_effects(device_id, capability)',
  `insert into device_effect_controls(device_id, capability, base, resolved, updated_at)
    select device_id, capability, base, resolved, updated_at from device_effect_targets
    where json_array_length(effects) > 0`,
  `insert into device_effects(id, device_id, capability, operation, priority, ordinal, run_id, node_id, expires_at)
    select json_extract(effect.value, '$.id'), target.device_id, target.capability,
      json_extract(effect.value, '$.operation'), json_extract(effect.value, '$.priority'),
      json_extract(effect.value, '$.order'), json_extract(effect.value, '$.runId'),
      json_extract(effect.value, '$.nodeId'), json_extract(effect.value, '$.expiresAt')
    from device_effect_targets target, json_each(target.effects) effect`,
  'drop table device_effect_commands',
  'drop table device_effect_targets',
];
