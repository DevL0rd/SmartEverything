import type { Migration } from './migration';

export const DRIVE_CONFLICTS_MIGRATION: Migration = {
  version: 193,
  name: 'drive-conflicts',
  statements: [
    `create table drive_conflicts (
      id text primary key,
      root_id text not null references drive_roots (id) on delete cascade,
      item_id text not null references drive_items (id) on delete cascade,
      conflict_item_id text not null references drive_items (id) on delete cascade,
      rel_path text not null check (length(rel_path) > 0),
      conflict_rel_path text not null check (length(conflict_rel_path) > 0),
      hub_rev integer not null check (hub_rev > 0),
      base_rev integer not null check (base_rev > 0),
      device_id text not null check (length(device_id) > 0),
      profile_id text references profiles (id) on delete set null,
      at text not null,
      resolved_at text,
      resolution text check (resolution is null
        or resolution in ('keep_hub', 'keep_client', 'keep_both')),
      check ((resolved_at is null) = (resolution is null))
    ) strict, without rowid`,
    'create index drive_conflicts_by_root on drive_conflicts (root_id, at desc, id)',
  ],
};
