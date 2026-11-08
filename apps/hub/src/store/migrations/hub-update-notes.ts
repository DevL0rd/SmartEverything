import type { Migration } from './migration';

export const HUB_UPDATE_NOTES_MIGRATION: Migration = {
  version: 165,
  name: 'hub-update-notes',
  statements: ['create table hub_update_notes (run_id text primary key) strict'],
};
