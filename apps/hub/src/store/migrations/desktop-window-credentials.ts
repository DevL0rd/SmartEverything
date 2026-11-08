import type { Migration } from './migration';

export const DESKTOP_WINDOW_CREDENTIALS_MIGRATION: Migration = {
  version: 177,
  name: 'desktop-window-credentials',
  statements: [
    'alter table computer_nodes add column profile_id text references profiles(id) on delete set null',
    `update computer_nodes
     set profile_id = (select profile_id from clients where id = computer_nodes.window_client_id)
     where window_client_id is not null`,
    `delete from clients
     where platform = 'web' and built_in = 0
       and id in (select window_client_id from computer_nodes where window_client_id is not null)`,
  ],
};
