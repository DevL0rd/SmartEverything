import type { Migration } from './migration';

export const AI_REPAIR_ADMISSION_MIGRATION: Migration = {
  version: 167,
  name: 'ai-repair-admission',
  statements: ['alter table ai_repair_groups add column admission text'],
};
