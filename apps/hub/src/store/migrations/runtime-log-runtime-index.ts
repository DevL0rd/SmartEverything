import type { Migration } from './migration';

export const RUNTIME_LOG_RUNTIME_INDEX_MIGRATION: Migration = {
  version: 213,
  name: 'runtime-log-runtime-index',
  statements: ['create index runtime_logs_runtime_at on runtime_logs (runtime, at desc, id desc)'],
};
