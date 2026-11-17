import type { Migration } from './migration';

export const DRIVE_ITEM_BACKLOG_INDEXES_MIGRATION: Migration = {
  version: 230,
  name: 'drive-item-backlog-indexes',
  statements: [
    "create index drive_items_unhashed on drive_items (root_id) where sha256 is null and kind not in ('folder', 'link', 'special')",
    "create index drive_items_unread_media on drive_items (root_id) where taken_at is null and kind in ('image', 'video', 'audio')",
  ],
};
