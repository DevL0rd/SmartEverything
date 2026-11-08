import type { Migration } from './migration';

export const AI_REPAIR_DISMISSAL_MIGRATION: Migration = {
  version: 171,
  name: 'ai-repair-dismissal',
  statements: [
    'alter table ai_repair_groups add column dismissed_observations integer not null default 0 check (dismissed_observations between 0 and observations)',
    'drop index ai_repair_groups_latest',
    `create index ai_repair_groups_latest on ai_repair_groups (last_at desc, fingerprint desc)
     where observations > dismissed_observations`,
  ],
};
