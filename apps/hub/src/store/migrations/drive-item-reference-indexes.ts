import type { Migration } from './migration';

export const DRIVE_ITEM_REFERENCE_INDEXES_MIGRATION: Migration = {
  version: 229,
  name: 'drive-item-reference-indexes',
  statements: [
    'create index drive_albums_by_cover on drive_albums (cover_item_id)',
    'create index drive_conflicts_by_item on drive_conflicts (item_id)',
    'create index drive_conflicts_by_conflict_item on drive_conflicts (conflict_item_id)',
    'create index photo_partner_delivered_by_item on photo_partner_delivered (item_id)',
  ],
};
