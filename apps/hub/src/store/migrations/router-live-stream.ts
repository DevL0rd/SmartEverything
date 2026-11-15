import type { Migration } from './migration';

export const ROUTER_LIVE_STREAM_MIGRATION: Migration = {
  version: 221,
  name: 'router-live-stream',
  statements: [`delete from plugin_data where plugin_id = 'router' and stream = 'router.snapshot'`],
};
