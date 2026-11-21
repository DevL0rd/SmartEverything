import { TIME_ZONE } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { basename } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { bareStoreUnit, storeUnit } from './host/unit';
import { migrate } from './migrate';
import { discardMigrationBackups } from './migration-backup';
import { MIGRATIONS } from './migrations';
import { repairPersonAccess } from './person-access-repair';
import { automationStorageMetrics } from './automation-storage-metrics';
import { agedRowsNamed, sweepAgedBatch } from './retention';
import {
  automationRetentionPlan,
  dropRunNodes,
  forgetPlans,
  forgetRuns,
} from './retention-automations';
import type { HostStore } from './host/host-store';

export interface StoreOpening {
  readonly systemTimeZone: string;
}

export interface StoreOpened {
  readonly version: number;
}

const PRAGMA_VALUE = z.record(z.string(), z.union([z.number(), z.string(), z.null()]));

function describeDatabase(database: DatabaseSync, path: string, log: Logger): void {
  try {
    const read = (pragma: string): unknown =>
      Object.values(PRAGMA_VALUE.parse(database.prepare(`pragma ${pragma}`).get() ?? {}))[0];
    log.debug('store.pragmas_read', () => ({
      file: basename(path),
      journalMode: read('journal_mode'),
      synchronous: read('synchronous'),
      foreignKeys: read('foreign_keys'),
      busyTimeoutMs: read('busy_timeout'),
      pageSize: read('page_size'),
      pageCount: read('page_count'),
      freelistCount: read('freelist_count'),
      walAutocheckpoint: read('wal_autocheckpoint'),
    }));
  } catch (cause) {
    log.warn('store.pragmas_failed', {
      errorName: cause instanceof Error ? cause.name : typeof cause,
      reason: messageOf(cause),
    });
  }
}

function startTimeZone(store: HostStore, systemTimeZone: string, log: Logger): void {
  if (!TIME_ZONE.safeParse(systemTimeZone).success) {
    log.warn('settings.system_time_zone_unknown', { timeZone: systemTimeZone });
    return;
  }
  const start = store.settings.initialiseTimeZone(systemTimeZone);
  if (start.initialised) {
    log.info('settings.time_zone_initialised', { from: start.from, to: start.to });
  }
}

export const STORE_OPEN_UNIT = bareStoreUnit((store, opening: StoreOpening): StoreOpened => {
  const log = new Logger('hub.store');
  const { sql } = store.context;
  sql.database.exec('pragma journal_mode = wal');
  describeDatabase(sql.database, store.path, log);
  const version = migrate(sql, MIGRATIONS, store.now().toISOString(), log);
  repairPersonAccess(sql, log);
  discardMigrationBackups(sql, log);
  store.write(() => {
    store.settings.ensure();
    store.weather.ensure();
    store.exchangeRates.ensure();
    startTimeZone(store, opening.systemTimeZone, log);
  });
  return { version };
});

export const STORE_RETENTION_READ_UNITS = {
  storeRetentionPlan: storeUnit((store, _input: null) =>
    automationRetentionPlan(store.context.sql, store.now()),
  ),
  storeAutomationStorage: storeUnit((store, _input: null) =>
    automationStorageMetrics(store.context.sql),
  ),
} as const;

export const STORE_RETENTION_WRITE_UNITS = {
  storeRetentionAged: storeUnit((store, { table }: { readonly table: string }): number =>
    sweepAgedBatch(store.context.sql, agedRowsNamed(table), store.now()),
  ),
  storeRetentionRuns: storeUnit((store, { ids }: { readonly ids: readonly string[] }) =>
    forgetRuns(store.context.sql, ids),
  ),
  storeRetentionNodes: storeUnit((store, { ids }: { readonly ids: readonly string[] }): number =>
    dropRunNodes(store.context.sql, ids),
  ),
  storeRetentionPlans: storeUnit(
    (store, { hashes }: { readonly hashes: readonly string[] }): number =>
      forgetPlans(store.context.sql, hashes),
  ),
} as const;
