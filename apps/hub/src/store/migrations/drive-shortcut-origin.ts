import type { Migration } from './migration';

export const DRIVE_SHORTCUT_ORIGIN_MIGRATION: Migration = {
  version: 220,
  name: 'drive-shortcut-origin',
  statements: [
    `alter table drive_shortcuts add column created_via text not null default 'app'
      check (created_via in ('app', 'ai', 'automation', 'mount', 'sync', 'scan', 'share', 'outside'))`,
    'create index drive_shortcuts_by_created on drive_shortcuts (created_at, id)',
  ],
};
