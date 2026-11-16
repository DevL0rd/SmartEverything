import type { Migration } from './migration';

export const DRIVE_TEXT_SEARCH_ROWID_MIGRATION: Migration = {
  version: 227,
  name: 'drive-text-search-rowid',
  statements: [
    `create virtual table drive_item_text_search_next using fts5(
    item_id unindexed, body,
    tokenize = 'unicode61 remove_diacritics 2'
  )`,
    `insert into drive_item_text_search_next (rowid, item_id, body)
    select t.rowid, s.item_id, s.body
      from drive_item_text_search s join drive_item_text t on t.item_id = s.item_id`,
    'drop trigger drive_item_text_forgotten',
    'drop table drive_item_text_search',
    'alter table drive_item_text_search_next rename to drive_item_text_search',
    `create trigger drive_item_text_forgotten after delete on drive_item_text begin
    delete from drive_item_text_search where rowid = old.rowid;
  end`,
  ],
};
