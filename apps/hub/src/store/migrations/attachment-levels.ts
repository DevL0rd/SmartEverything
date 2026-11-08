import type { Migration } from './migration';

export const ATTACHMENT_LEVELS_MIGRATION: Migration = {
  version: 188,
  name: 'attachment-levels',
  statements: [
    'alter table assistant_attachments add column levels text check (levels is null or json_valid(levels))',
  ],
};
