import type { Migration } from './migration';

export const LOG_RELEASE_MIGRATION: Migration = {
  version: 197,
  name: 'log-release',
  statements: [
    `alter table runtime_logs
      add column release text check (release is null or length(release) between 1 and 40)`,
    `alter table runtime_logs
      add column bundle text check (bundle is null or length(bundle) between 1 and 40)`,
  ],
};
