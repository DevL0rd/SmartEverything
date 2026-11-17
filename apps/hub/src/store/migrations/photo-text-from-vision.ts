import type { Migration } from './migration';

export const PHOTO_TEXT_FROM_VISION_MIGRATION: Migration = {
  version: 234,
  name: 'photo-text-from-vision',
  statements: [
    `delete from drive_item_text
      where item_id in (select id from drive_items where kind in ('image', 'video'))`,
    `insert into drive_item_text (item_id, rev, source, state, reason, chars, extracted_at)
      select pa.item_id, pa.rev, 'image', 'ok', null, length(pa.text), pa.analysed_at
        from photo_analysis pa join drive_items di on di.id = pa.item_id and di.rev = pa.rev
        where pa.state = 'done' and pa.text is not null`,
    `insert into drive_item_text_search (rowid, item_id, body)
      select t.rowid, t.item_id, pa.text
        from drive_item_text t join photo_analysis pa on pa.item_id = t.item_id
        where t.source = 'image'`,
    `update ai_settings set settings = json_remove(settings, '$.ocrLanguages') where key = 'drive'`,
  ],
};
