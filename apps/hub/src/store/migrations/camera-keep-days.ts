import { DEFAULT_CAMERA_KEEP_DAYS } from '@smarteverything/domain';
import type { Migration } from './migration';

export const CAMERA_KEEP_DAYS_MIGRATION: Migration = {
  version: 134,
  name: 'camera_keep_days',
  statements: [
    `alter table cameras add column keep_days integer not null
      default ${String(DEFAULT_CAMERA_KEEP_DAYS)} check (keep_days >= 1)`,
  ],
};
