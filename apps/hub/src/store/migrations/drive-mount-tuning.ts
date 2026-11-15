import { availableParallelism } from 'node:os';
import { DEFAULT_FILE_IO_THREADS, DEFAULT_LISTING_CACHE_SECONDS } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import type { Migration } from './migration';
import type { Sql } from '../sql';

function seedTuning(sql: Sql): LogPayload {
  const cpuWorkers = availableParallelism();
  const seeded = sql.run(
    'seed the drive mount tuning settings',
    `update ai_settings
     set settings = json_set(
       settings,
       '$.fileIoThreads', json(:fileIoThreads),
       '$.cpuWorkers', json(:cpuWorkers),
       '$.listingCacheSeconds', json(:listingCacheSeconds)
     )
     where key = 'drive'`,
    {
      fileIoThreads: String(DEFAULT_FILE_IO_THREADS),
      cpuWorkers: String(cpuWorkers),
      listingCacheSeconds: String(DEFAULT_LISTING_CACHE_SECONDS),
    },
  );
  return { seeded, cpuWorkers };
}

export const DRIVE_MOUNT_TUNING_MIGRATION: Migration = {
  version: 223,
  name: 'drive-mount-tuning',
  statements: [],
  backfill: seedTuning,
};
