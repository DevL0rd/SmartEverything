import type { Migration } from './migration';

const COUNT = (column: string): string => `check (${column} >= 0)`;

const COLUMNS = `id, root_id, target_kind, target_id, base_rev, name, length, offset, state,
  failure_reason, profile_id, client_id, node_id, created_at, expires_at, expected_sha256`;

export const DRIVE_UPLOAD_TOP_MIGRATION: Migration = {
  version: 204,
  name: 'drive-upload-top',
  foreignKeys: 'off',
  statements: [
    `create table drive_uploads_next (
      id text primary key,
      root_id text not null references drive_roots (id) on delete cascade,
      target_kind text not null check (target_kind in ('drive', 'folder', 'item')),
      target_id text not null,
      base_rev integer check (base_rev is null or base_rev > 0),
      name text not null check (length(name) > 0),
      length integer not null ${COUNT('length')},
      offset integer not null ${COUNT('offset')},
      state text not null check (state in ('open', 'committing', 'complete', 'failed', 'expired')),
      failure_reason text check (failure_reason is null or length(failure_reason) > 0),
      profile_id text not null references profiles (id) on delete cascade,
      client_id text references clients (id) on delete cascade,
      node_id text references computer_nodes (device_id) on delete cascade,
      created_at text not null,
      expires_at text not null,
      expected_sha256 text check (expected_sha256 is null or (length(expected_sha256) = 64 and expected_sha256 not glob '*[^0-9a-f]*')),
      check (offset <= length),
      check ((target_kind = 'item') = (base_rev is not null)),
      check ((target_kind = 'drive') = (target_id = root_id)),
      check ((client_id is null) <> (node_id is null)),
      check ((state = 'failed') = (failure_reason is not null)),
      check (expires_at > created_at)
    ) strict`,
    `insert into drive_uploads_next (${COLUMNS}) select ${COLUMNS} from drive_uploads`,
    'drop table drive_uploads',
    'alter table drive_uploads_next rename to drive_uploads',
    'create index drive_uploads_by_expiry on drive_uploads (expires_at)',
    'create index drive_uploads_by_profile on drive_uploads (profile_id, created_at desc)',
  ],
};
