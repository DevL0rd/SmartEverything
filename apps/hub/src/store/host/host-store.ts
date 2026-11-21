import { DatabaseSync } from 'node:sqlite';
import { background, type Logger } from '@smarteverything/logging';
import type { DriveFolders } from '../../data-layout/drive-folders';
import type { Ledger } from '../../ledger/ledger';
import { assembledStore, type Repositories } from '../assemble';
import type { StoreContext } from '../context';
import { ChangeFeed } from '../feed';
import { StoreReader } from '../reader';
import { durableSessionWrite } from '../repositories/dsh-session-durability';
import type { SettingsRepository } from '../repositories/settings';
import { reportedSql } from '../sql-report';

export type HostStore = Repositories & {
  readonly path: string;
  readonly context: StoreContext;
  readonly database: DatabaseSync;
  readonly feed: ChangeFeed;
  readonly reader: StoreReader;
  readonly settings: SettingsRepository;
  readonly ledger: Ledger;
  readonly now: () => Date;
  readonly write: <T>(work: () => T) => T;
  readonly durableWrite: <T>(work: () => T) => T;
  readonly close: () => void;
};

export interface HostStoreOptions {
  readonly path: string;
  readonly driveFolders: DriveFolders | null;
  readonly readOnly: boolean;
  readonly busyTimeoutMs: number;
  readonly log: Logger;
  readonly now: () => Date;
}

function openConnection(options: HostStoreOptions): DatabaseSync {
  const database = new DatabaseSync(options.path, {
    enableForeignKeyConstraints: true,
    readOnly: options.readOnly,
  });
  database.exec(`pragma busy_timeout = ${String(options.busyTimeoutMs)}`);
  if (!options.readOnly) {
    database.exec('pragma synchronous = normal');
    database.exec('pragma wal_autocheckpoint = 0');
  }
  return database;
}

export function openHostStore(options: HostStoreOptions): HostStore {
  const database = openConnection(options);
  const { sql, stop } = reportedSql(database, options.log);
  const feed = new ChangeFeed(options.log);
  const { context, settings, ledger, repositories } = assembledStore(sql, feed, {
    log: options.log,
    now: options.now,
    driveFolders: options.driveFolders,
  });
  const reader = new StoreReader(options);
  return {
    ...repositories,
    path: options.path,
    context,
    database,
    feed,
    reader,
    settings,
    ledger,
    now: options.now,
    write: (work) => context.write(work),
    durableWrite: (work) => durableSessionWrite(context, work),
    close: (): void => {
      background(reader.close(), 'store.host_reader_close_failed');
      stop();
      database.close();
    },
  };
}
