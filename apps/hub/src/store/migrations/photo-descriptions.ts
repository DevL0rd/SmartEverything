import type { Migration } from './migration';

export const PHOTO_DESCRIPTIONS_MIGRATION: Migration = {
  version: 236,
  name: 'photo-descriptions',
  statements: [
    `create table photo_descriptions (
    item_id text primary key references drive_items (id) on delete cascade,
    text text check (text is null or length(trim(text)) > 0),
    source text not null check (source in ('file', 'manual')),
    set_by text references profiles (id) on delete set null,
    set_at text not null,
    check (source = 'manual' or (text is not null and set_by is null))
  ) strict`,
    'create index photo_descriptions_by_setter on photo_descriptions (set_by) where set_by is not null',
    `create table photo_description_backlog (
    item_id text primary key references drive_items (id) on delete cascade
  ) strict, without rowid`,
    `insert into photo_description_backlog (item_id)
      select id from drive_items where kind = 'image'`,
  ],
};
