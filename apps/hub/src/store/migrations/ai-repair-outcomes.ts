import type { Migration } from './migration';

export const AI_REPAIR_OUTCOMES_MIGRATION: Migration = {
  version: 168,
  name: 'ai-repair-outcomes',
  statements: [
    'alter table ai_repair_groups add column automatic_admitted integer not null default 0 check (automatic_admitted in (0, 1))',
    'alter table ai_repair_groups add column failed_event_id text',
    `create index ai_repair_event on ai_repair_groups (json_extract(admission, '$.eventId'))
     where admission is not null`,
  ],
};
