import type { Migration } from './migration';

export const QUEUE_ORDER_INDEXES_MIGRATION: Migration = {
  version: 237,
  name: 'queue-order-indexes',
  statements: [
    'drop index drive_media_jobs_by_queue',
    "create index drive_media_jobs_by_queue on drive_media_jobs (kind, visible desc, queued_at, id) where state = 'queued'",
    "create index drive_uploads_open_by_expiry on drive_uploads (expires_at) where state = 'open'",
  ],
};
