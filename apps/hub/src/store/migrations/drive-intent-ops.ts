import type { Migration } from './migration';

export const DRIVE_INTENT_OPS_MIGRATION: Migration = {
  version: 217,
  name: 'drive-intent-ops',
  statements: [
    `create table drive_intents_next (
      id text primary key,
      root_id text not null references drive_roots (id) on delete cascade,
      op text not null check (op in ('trash', 'restore', 'version', 'commit', 'patch', 'exchange')),
      from_path text not null check (length(from_path) > 0),
      to_path text not null check (length(to_path) > 0),
      version_path text check (version_path is null or length(version_path) > 0),
      at text not null,
      check (op in ('commit', 'version', 'patch') or version_path is null)
    ) strict`,
    `insert into drive_intents_next (id, root_id, op, from_path, to_path, version_path, at)
      select id, root_id, op, from_path, to_path, version_path, at from drive_intents`,
    'drop table drive_intents',
    'alter table drive_intents_next rename to drive_intents',
    'create index drive_intents_by_root on drive_intents (root_id, at)',
  ],
};
