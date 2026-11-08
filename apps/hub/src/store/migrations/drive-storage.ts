import type { Sql } from '../sql';
import { jsonText } from '../sql';
import type { Migration } from './migration';

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const JSON_OBJECT = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'object')`;

const COUNT = (column: string): string => `check (${column} >= 0)`;

const SHA256 = (column: string): string =>
  `check (length(${column}) = 64 and ${column} not glob '*[^0-9a-f]*')`;

const VIA = "('app', 'ai', 'automation', 'mount', 'sync', 'scan', 'share', 'outside')";

const DRIVE_SETTINGS_SEED = {
  uploadExpiryDays: 7,
  membersMayShare: false,
  duplicatesHashing: true,
  indexingPaused: false,
};

const VERSIONS = [
  `create table drive_versions (
    id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    item_id text not null,
    rev integer not null check (rev > 0),
    sha256 text not null ${SHA256('sha256')},
    bytes integer not null ${COUNT('bytes')},
    at text not null,
    purge_at text not null,
    actor_profile_id text references profiles (id) on delete set null,
    via text not null check (via in ${VIA}),
    device_id text,
    added_by_profile_id text references profiles (id) on delete set null,
    unique (item_id, rev),
    check (purge_at > at)
  ) strict`,
  'create index drive_versions_by_purge on drive_versions (purge_at)',
  'create index drive_versions_by_content on drive_versions (root_id, sha256)',
  'create index drive_versions_by_adder on drive_versions (added_by_profile_id)',
];

const SHARES = [
  `create table drive_shares (
    id text primary key,
    item_id text not null,
    token_hash text not null unique,
    permission text not null check (permission in ('view', 'download')),
    expires_at text,
    password_hash text check (password_hash is null or length(password_hash) > 0),
    created_by text not null references profiles (id) on delete cascade,
    created_at text not null,
    revoked_at text,
    opens integer not null ${COUNT('opens')},
    downloads integer not null ${COUNT('downloads')},
    last_opened_at text
  ) strict`,
  'create index drive_shares_by_item on drive_shares (item_id, created_at desc)',
  `create table drive_share_events (
    id integer primary key autoincrement,
    share_id text not null references drive_shares (id) on delete cascade,
    kind text not null check (kind in ('open', 'download')),
    at text not null
  ) strict`,
  'create index drive_share_events_by_share on drive_share_events (share_id, id)',
];

const UPLOADS = [
  `create table drive_uploads (
    id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    target_kind text not null check (target_kind in ('folder', 'item')),
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
    check (offset <= length),
    check ((target_kind = 'item') = (base_rev is not null)),
    check ((client_id is null) <> (node_id is null)),
    check ((state = 'failed') = (failure_reason is not null)),
    check (expires_at > created_at)
  ) strict`,
  'create index drive_uploads_by_expiry on drive_uploads (expires_at)',
  'create index drive_uploads_by_profile on drive_uploads (profile_id, created_at desc)',
];

const QUOTAS = `create table drive_quotas (
  profile_id text primary key references profiles (id) on delete cascade,
  bytes integer not null ${COUNT('bytes')}
) strict`;

const INTEGRITY = [
  `create table drive_scrub (
    item_id text primary key references drive_items (id) on delete cascade,
    root_id text not null references drive_roots (id) on delete cascade,
    verified_at text not null,
    result text not null check (result in ('ok', 'corrupt'))
  ) strict`,
  'create index drive_scrub_by_root on drive_scrub (root_id, verified_at)',
  `create table drive_blocks (
    item_id text not null references drive_items (id) on delete cascade,
    rev integer not null check (rev > 0),
    block_size integer not null check (block_size > 0),
    hashes blob not null,
    primary key (item_id, rev)
  ) strict, without rowid`,
];

const INTENTS = [
  `create table drive_intents (
    id text primary key,
    root_id text not null references drive_roots (id) on delete cascade,
    op text not null check (op in ('trash', 'restore', 'version', 'commit')),
    from_path text not null check (length(from_path) > 0),
    to_path text not null check (length(to_path) > 0),
    version_path text check (version_path is null or length(version_path) > 0),
    at text not null,
    check (op in ('commit', 'version') or version_path is null)
  ) strict`,
  'create index drive_intents_by_root on drive_intents (root_id, at)',
];

const SYNC = [
  `create table drive_sync_clients (
    client_id text not null references clients (id) on delete cascade,
    root_id text not null references drive_roots (id) on delete cascade,
    device_id text not null references devices (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    enabled integer not null ${FLAG('enabled')},
    selected text not null ${JSON_ARRAY('selected')},
    last_seq integer not null ${COUNT('last_seq')},
    last_seen_at text,
    need_bytes integer not null ${COUNT('need_bytes')},
    errors text not null ${JSON_ARRAY('errors')},
    primary key (client_id, root_id)
  ) strict, without rowid`,
  'create index drive_sync_clients_by_root on drive_sync_clients (root_id)',
  `create table drive_sync_ops (
    client_id text not null references clients (id) on delete cascade,
    op_id text not null check (length(op_id) > 0),
    result text not null ${JSON_OBJECT('result')},
    at text not null,
    primary key (client_id, op_id)
  ) strict, without rowid`,
  'create index drive_sync_ops_by_time on drive_sync_ops (at)',
];

const BACKUPS = [
  `create table drive_backups (
    id integer primary key autoincrement,
    at text not null,
    reporter text not null check (length(reporter) > 0),
    bytes integer not null ${COUNT('bytes')},
    ok integer not null ${FLAG('ok')}
  ) strict`,
  'create index drive_backups_by_time on drive_backups (at desc)',
];

function seedDriveSettings(sql: Sql, now: string): Readonly<Record<string, number>> {
  sql.run(
    'seed the drive settings',
    'insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)',
    { key: 'drive', settings: jsonText(DRIVE_SETTINGS_SEED), now },
  );
  return { settings: 1 };
}

export const DRIVE_STORAGE_MIGRATION: Migration = {
  version: 182,
  name: 'drive-storage',
  statements: [
    ...VERSIONS,
    ...SHARES,
    ...UPLOADS,
    QUOTAS,
    ...INTEGRITY,
    ...INTENTS,
    ...SYNC,
    ...BACKUPS,
  ],
  backfill: seedDriveSettings,
};
