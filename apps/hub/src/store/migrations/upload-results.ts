import type { Migration } from './migration';

export const UPLOAD_RESULTS_MIGRATION: Migration = {
  version: 198,
  name: 'upload-results',
  statements: [
    `alter table drive_uploads add column expected_sha256 text
      check (expected_sha256 is null or (length(expected_sha256) = 64 and expected_sha256 not glob '*[^0-9a-f]*'))`,
    `create table drive_upload_results (
      upload_id text primary key references drive_uploads(id) on delete cascade,
      item_id text not null,
      name text not null
    ) strict`,
  ],
};
