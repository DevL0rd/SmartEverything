import type { Migration } from './migration';

export const PHOTOS_THUMBHASH_DROP_MIGRATION: Migration = {
  version: 226,
  name: 'photos-thumbhash-drop',
  statements: ['alter table drive_media drop column thumbhash'],
};
