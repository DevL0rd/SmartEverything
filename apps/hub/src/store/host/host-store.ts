import { DatabaseSync } from 'node:sqlite';
import type { Logger } from '@smarteverything/logging';
import type { DriveFolders } from '../../data-layout/drive-folders';
import { assembledStore } from '../assemble';
import { ChangeFeed } from '../feed';
import { StoreReader } from '../reader';
import { durableSessionWrite } from '../repositories/dsh-session-durability';
import { reportedSql } from '../sql-report';
import type { Store } from '../store';
import type { StoreHost } from './host';
import type { StoreLive } from '../live';
import { StoreHostOnlyMainError } from './errors';

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

export function openHostStore(options: HostStoreOptions): Store {
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
    startRetention: (): never => {
      throw new StoreHostOnlyMainError('retention');
    },
    get host(): StoreHost {
      throw new StoreHostOnlyMainError('host');
    },
    get live(): StoreLive {
      throw new StoreHostOnlyMainError('live');
    },
    close: (): void => {
      reader.close();
      stop();
      database.close();
    },
  };
}
