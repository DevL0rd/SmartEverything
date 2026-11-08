import type { Migration } from './migration';

export const ANDROID_BUILD_OUTCOMES_MIGRATION: Migration = {
  version: 184,
  name: 'android-build-outcomes',
  statements: [
    `alter table android_build_observations
      add column outcome text check (outcome is null or json_valid(outcome))`,
    `delete from android_build_observations where json_extract(build, '$.channel') = 'dev'`,
  ],
};
