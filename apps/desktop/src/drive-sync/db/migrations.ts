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
        placement_id text not null,
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
        primary key (placement_id, rel_path),
        check (kind = 'file' or (blocks is null and block_size is null and bytes = 0)),
        check (local_hash_state = 'hashed' or (blocks is null and block_size is null)),
        check (local_hash_state <> 'hashed' or kind = 'folder' or (blocks is not null and block_size is not null))
      ) strict, without rowid`,
      `create table cursors (
        placement_id text primary key,
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
      `create table exclusions (
        placement_id text not null,
        path text not null,
        primary key (placement_id, path)
      ) strict, without rowid`,
      `create table pins (
        placement_id text not null,
        path text not null,
        primary key (placement_id, path)
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
  {
    version: 3,
    name: 'drive-sync-metadata',
    statements: [
      `create table files_next (
        placement_id text not null,
        rel_path text not null,
        kind text not null check (kind in ('file', 'folder', 'link')),
        bytes integer not null check (bytes >= 0),
        mtime_ns integer not null,
        mode integer not null check (mode between 0 and 4095),
        hub_rev integer check (hub_rev is null or hub_rev >= 0),
        local_hash_state text not null check (local_hash_state in ('hashed', 'stale', 'unhashed')),
        block_size integer check (block_size is null or block_size > 0),
        blocks blob check (blocks is null or length(blocks) % 32 = 0),
        pinned integer not null default 0 check (pinned in (0, 1)),
        link_target text,
        link_key text,
        hub_inode integer check (hub_inode is null or hub_inode >= 0),
        xattrs text not null default '[]' check (json_valid(xattrs)),
        meta_dirty integer not null default 0 check (meta_dirty in (0, 1)),
        primary key (placement_id, rel_path),
        check (kind = 'file' or (blocks is null and block_size is null and bytes = 0)),
        check (local_hash_state = 'hashed' or (blocks is null and block_size is null)),
        check (local_hash_state <> 'hashed' or kind <> 'file' or (blocks is not null and block_size is not null)),
        check ((kind = 'link') = (link_target is not null)),
        check (kind = 'file' or link_key is null)
      ) strict, without rowid`,
      `insert into files_next (placement_id, rel_path, kind, bytes, mtime_ns, mode, hub_rev,
        local_hash_state, block_size, blocks, pinned, meta_dirty)
       select placement_id, rel_path, kind, bytes, mtime_ns,
        case when mode = 0 then (case when kind = 'folder' then 493 else 420 end) else mode & 4095 end,
        hub_rev, local_hash_state, block_size, blocks, pinned, hub_rev is not null from files`,
      'drop table files',
      'alter table files_next rename to files',
      'create index files_hub_inode on files (placement_id, hub_inode) where hub_inode is not null',
      `create table pending_ops_next (
        op_id text primary key,
        kind text not null check (kind in ('push', 'move', 'tombstone', 'meta', 'link')),
        payload text not null check (json_valid(payload)),
        state text not null check (state in ('queued', 'sent'))
      ) strict`,
      `insert into pending_ops_next (rowid, op_id, kind, payload, state)
       select rowid, op_id, kind, payload, state from pending_ops`,
      'drop table pending_ops',
      'alter table pending_ops_next rename to pending_ops',
    ],
  },
];
