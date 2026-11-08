import type { Migration } from './migration';

export const HOME_MAP_MIGRATION: Migration = {
  version: 144,
  name: 'home-map',
  statements: [
    `create table home_maps (
      id text primary key check (length(id) between 1 and 40),
      revision integer not null check (revision >= 1),
      document text not null check (json_valid(document)),
      updated_at text not null
    ) strict, without rowid`,
    `create table home_map_revisions (
      map_id text not null references home_maps (id) on delete cascade,
      revision integer not null check (revision >= 1),
      ops text not null check (json_valid(ops)),
      inverse text not null check (json_valid(inverse)),
      actor text not null check (
        actor like 'profile:_%' or actor like 'ai:_%' or actor like 'source:_%'
      ),
      at text not null,
      undoes integer check (undoes is null or undoes >= 1),
      redoes integer check (redoes is null or redoes >= 1),
      check (undoes is null or redoes is null),
      primary key (map_id, revision)
    ) strict, without rowid`,
    'create index home_map_revisions_actor_idx on home_map_revisions (map_id, actor, revision)',
    `create table home_map_sources (
      map_id text not null references home_maps (id) on delete cascade,
      source_id text not null check (length(source_id) >= 1),
      kind text not null check (length(kind) >= 1),
      device_id text not null check (length(device_id) >= 1),
      document text not null check (json_valid(document)),
      primary key (map_id, source_id)
    ) strict, without rowid`,
    'create index home_map_sources_device_idx on home_map_sources (device_id, map_id)',
  ],
};
