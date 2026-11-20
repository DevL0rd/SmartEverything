import type { Migration } from './migration';

export const DEVICE_PATH_INDEXES_MIGRATION: Migration = {
  version: 240,
  name: 'device-path-indexes',
  statements: ['create index automation_runs_created on automation_runs (created_at)'],
};
