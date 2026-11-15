import type { Migration } from './migration';

export const PHOTOS_WAVE2_LEDGERS_MIGRATION: Migration = {
  version: 218,
  name: 'photos-wave2-ledgers',
  statements: [
    `create table photo_partner_delivered (
      album_id text not null references drive_albums (id) on delete cascade,
      item_id text not null references drive_items (id) on delete cascade,
      delivered_at text not null,
      primary key (album_id, item_id)
    ) strict, without rowid`,
    `create table photo_merge_dismissals (
      profile_id text not null references profiles (id) on delete cascade,
      group_a text not null references photo_groups (id) on delete cascade,
      group_b text not null references photo_groups (id) on delete cascade,
      dismissed_at text not null,
      primary key (profile_id, group_a, group_b),
      check (group_a < group_b)
    ) strict, without rowid`,
    'create index photo_merge_dismissals_by_a on photo_merge_dismissals (group_a)',
    'create index photo_merge_dismissals_by_b on photo_merge_dismissals (group_b)',
  ],
};
