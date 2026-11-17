import type { Migration } from './migration';

export const DRIVE_MISSING_MIGRATION: Migration = {
  version: 231,
  name: 'drive-missing',
  statements: [
    `create table drive_missing (
    item_id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    rel_path text not null check (length(rel_path) > 0),
    bytes integer not null check (bytes >= 0),
    sha256 text check (sha256 is null or (length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*')),
    missing_at text not null,
    purge_at text not null,
    check (purge_at > missing_at)
  ) strict`,
    'create index drive_missing_by_size on drive_missing (root_id, bytes)',
    'create index drive_missing_by_purge on drive_missing (purge_at)',
    `create table drive_missing_rows (
    missing_item_id text not null references drive_missing (item_id) on delete cascade,
    seq integer not null check (seq >= 0),
    table_name text not null check (length(table_name) > 0),
    row text not null check (json_valid(row)),
    primary key (missing_item_id, seq)
  ) strict, without rowid`,
  ],
};
