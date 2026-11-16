import type { Migration } from './migration';

export const DRIVE_INODE_LEASES_MIGRATION: Migration = {
  version: 228,
  name: 'drive-inode-leases',
  statements: [
    `create table drive_inode_leases (
    node_id text not null references computer_nodes (device_id) on delete cascade,
    start integer not null check (start > 0),
    end integer not null check (end > start),
    primary key (node_id, start)
  ) strict, without rowid`,
  ],
};
