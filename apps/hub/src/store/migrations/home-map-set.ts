import type { Migration } from './migration';

export const HOME_MAP_SET_MIGRATION: Migration = {
  version: 146,
  name: 'home-map-set',
  statements: [
    'alter table home_maps add column position integer not null default 0 check (position >= 0)',
    'alter table home_maps add column is_default integer not null default 0 check (is_default in (0, 1))',
    'update home_maps set is_default = 1 where id = (select id from home_maps order by id limit 1)',
    'create unique index home_maps_default_idx on home_maps (is_default) where is_default = 1',
    'alter table home_map_sources add column robot_map_id integer check (robot_map_id is null or robot_map_id >= 0)',
    `update home_map_sources set robot_map_id = json_extract(document, '$.robotMapId')
      where json_type(document, '$.robotMapId') = 'integer'`,
    `create unique index home_map_sources_robot_map_idx
      on home_map_sources (device_id, robot_map_id) where robot_map_id is not null`,
    `create table home_map_versions (
      map_id text not null references home_maps (id) on delete cascade,
      version_id text not null check (length(version_id) >= 1),
      name text,
      document text not null check (json_valid(document)),
      created_at text not null,
      actor text not null check (length(actor) >= 1),
      primary key (map_id, version_id)
    ) strict, without rowid`,
    'create index home_map_versions_created_idx on home_map_versions (map_id, created_at)',
  ],
};
