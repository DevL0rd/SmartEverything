export interface ClientMigration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const CLIENT_MIGRATIONS: readonly ClientMigration[] = [
  {
    version: 1,
    name: 'drive-sync',
    statements: [
      `create table files (
        root_id text not null,
        rel_path text not null,
        kind text not null check (kind in ('file', 'folder')),
        bytes integer not null check (bytes >= 0),
        mtime_ns integer not null,
        mode integer not null,
        hub_rev integer check (hub_rev is null or hub_rev >= 0),
        local_hash_state text not null check (local_hash_state in ('hashed', 'stale', 'unhashed')),
        block_size integer check (block_size is null or block_size > 0),
        blocks blob check (blocks is null or length(blocks) % 32 = 0),
        pinned integer not null default 0 check (pinned in (0, 1)),
        primary key (root_id, rel_path),
        check (kind = 'file' or (blocks is null and block_size is null and bytes = 0)),
        check (local_hash_state = 'hashed' or (blocks is null and block_size is null)),
        check (local_hash_state <> 'hashed' or kind = 'folder' or (blocks is not null and block_size is not null))
      ) strict, without rowid`,
      `create table cursors (
        root_id text primary key,
        index_id text not null,
        last_seq integer not null check (last_seq >= 0)
      ) strict, without rowid`,
      `create table pending_ops (
        op_id text primary key,
        kind text not null check (kind in ('push', 'move', 'tombstone')),
        payload text not null check (json_valid(payload)),
        state text not null check (state in ('queued', 'sent'))
      ) strict`,
      `create table transfers (
        txn text not null,
        item text not null,
        block_count integer not null check (block_count >= 0),
        verified blob not null check (length(verified) = (block_count + 7) / 8),
        primary key (txn, item)
      ) strict, without rowid`,
      `create table selections (
        root_id text not null,
        path text not null,
        primary key (root_id, path)
      ) strict, without rowid`,
      `create table pins (
        root_id text not null,
        path text not null,
        primary key (root_id, path)
      ) strict, without rowid`,
    ],
  },
  {
    version: 2,
    name: 'placements-cache',
    statements: [
      `create table placements (
        id text primary key,
        position integer not null check (position >= 0),
        body text not null check (json_valid(body))
      ) strict, without rowid`,
    ],
  },
];
