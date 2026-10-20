import { TIME_ZONE } from '@smarteverything/domain';
import { basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import { StoreContext } from './context';
import { ChangeFeed } from './feed';
import { migrate } from './migrate';
import { repairPersonAccess } from './person-access-repair';
import { MIGRATIONS } from './migrations';
import { assistantRepositories } from './repositories/areas/assistant';
import { automationRepositories } from './repositories/areas/automation';
import { computerRepositories } from './repositories/areas/computers';
import { healthRepositories } from './repositories/areas/health';
import { homeRepositories } from './repositories/areas/home';
import { peopleRepositories } from './repositories/areas/people';
import { platformRepositories } from './repositories/areas/platform';
import { durableSessionWrite } from './repositories/dsh-session-durability';
import { SettingsRepository } from './repositories/settings';
import { automationStorageMetrics } from './automation-storage-metrics';
import { sweepRetention } from './retention';
import { reportedSql } from './sql-report';
import type { Sql } from './sql';
import { Ledger } from '../ledger/ledger';
import { DAY_MS } from '../metrics/minute';
import { messageOf } from '@smarteverything/logging';

export interface StoreOptions {
  readonly path: string;
  readonly log: Logger;
  readonly now: () => Date;
  readonly systemTimeZone: string;
}

const BUSY_TIMEOUT_MS = 5000;

const FEED_SUMMARY_MS = 60_000;

const RETENTION_SWEEP_MS = DAY_MS;

function openDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.exec(`pragma busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
  database.exec('pragma journal_mode = wal');
  database.exec('pragma synchronous = normal');
  database.exec('pragma foreign_keys = on');
  return database;
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

function startTimeZone(settings: SettingsRepository, options: StoreOptions): void {
  if (!TIME_ZONE.safeParse(options.systemTimeZone).success) {
    options.log.warn('settings.system_time_zone_unknown', { timeZone: options.systemTimeZone });
    return;
  }
  const start = settings.initialiseTimeZone(options.systemTimeZone);
  if (start.initialised) {
    options.log.info('settings.time_zone_initialised', { from: start.from, to: start.to });
  }
}

const repositoriesOf = (context: StoreContext, log: Logger) =>
  ({
    ...homeRepositories(context, log),
    ...computerRepositories(context),
    ...automationRepositories(context),
    ...healthRepositories(context),
    ...assistantRepositories(context),
    ...peopleRepositories(context),
    ...platformRepositories(context),
  }) as const;

export type Store = ReturnType<typeof repositoriesOf> & {
  readonly feed: ChangeFeed;
  readonly settings: SettingsRepository;
  readonly ledger: Ledger;
  readonly now: () => Date;
  readonly write: <T>(work: () => T) => T;
  readonly durableWrite: <T>(work: () => T) => T;
  readonly close: () => void;
};

function migrated(sql: Sql, options: StoreOptions): number {
  const version = migrate(sql, MIGRATIONS, options.now().toISOString(), options.log);
  repairPersonAccess(sql, options.log);
  return version;
}

function startRetention(sql: Sql, options: StoreOptions): NodeJS.Timeout {
  const sweep = (): void => {
    const removed = sweepRetention(sql, options.now());
    options.log.debug('store.retention_swept', removed);
    options.log.debug('store.automation_storage', () => ({
      tables: automationStorageMetrics(sql),
    }));
  };
  sweep();
  const timer = setInterval(sweep, RETENTION_SWEEP_MS);
  timer.unref();
  return timer;
}

export function openStore(options: StoreOptions): Store {
  options.log.debug('store.opening', () => ({ file: basename(options.path) }));
  const database = openDatabase(options.path);
  describeDatabase(database, options.path, options.log);
  const { sql, stop } = reportedSql(database, options.log);
  const startedAt = performance.now();
  const version = migrated(sql, options);
  const feed = new ChangeFeed(options.log);
  const context = new StoreContext(sql, feed, options.now);
  const settings = new SettingsRepository(context);
  settings.ensure();
  startTimeZone(settings, options);
  const feedSummary = setInterval(() => {
    options.log.debug('change.summary', () => ({ ...feed.drain(), windowMs: FEED_SUMMARY_MS }));
  }, FEED_SUMMARY_MS);
  feedSummary.unref();
  const retention = startRetention(sql, options);
  options.log.info('store.opened', { version });
  options.log.debug('store.open_timed', () => ({
    file: basename(options.path),
    durationMs: Math.round(performance.now() - startedAt),
  }));
  return {
    feed,
    settings,
    ...repositoriesOf(context, options.log),
    ledger: new Ledger(context, () => settings.read().time_zone),
    now: options.now,
    write: (work) => context.write(work),
    durableWrite: (work) => durableSessionWrite(context, work),
    close: (): void => {
      clearInterval(feedSummary);
      clearInterval(retention);
      stop();
      try {
        database.close();
      } catch (cause) {
        options.log.error('store.close_failed', cause, { file: basename(options.path) });
        throw cause;
      }
      options.log.info('store.closed', { file: basename(options.path) });
    },
  };
}
