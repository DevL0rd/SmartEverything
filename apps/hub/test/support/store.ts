import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { assembledStore } from '../../src/store/assemble';
import type { HostStore } from '../../src/store/host/host-store';
import { durableSessionWrite } from '../../src/store/repositories/dsh-session-durability';
import { reportedSql } from '../../src/store/sql-report';
import {
  openStore,
  STORE_BUSY_TIMEOUT_MS,
  type Store,
  type StoreOptions,
} from '../../src/store/store';
import { testLogger } from './logs';
import { testStoreHost } from './store-host';

export type SeededStore = Store & Omit<HostStore, 'path' | 'feed' | 'reader' | 'now' | 'close'>;

export const OPEN_STORES = new Set<Store>();

function seedingConnection(path: string): DatabaseSync {
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.exec(`pragma busy_timeout = ${String(STORE_BUSY_TIMEOUT_MS)}`);
  database.exec('pragma synchronous = normal');
  database.exec('pragma wal_autocheckpoint = 0');
  return database;
}

export async function openSeededStore(options: StoreOptions): Promise<SeededStore> {
  const store = await openStore(options);
  const database = seedingConnection(options.path);
  const { sql, stop } = reportedSql(database, options.log);
  const { context, settings, ledger, repositories } = assembledStore(sql, store.feed, options);
  const stopCommits = sql.onCommit(() => {
    store.host.committedOnMain();
  });
  const stopForeign = store.feed.subscribeCommitted(() => {
    context.foreignCommitted();
  });
  return {
    ...repositories,
    ...store,
    context,
    database,
    settings,
    ledger,
    write: (work) => context.write(work),
    durableWrite: (work) => durableSessionWrite(context, work),
    close: async (): Promise<void> => {
      stopForeign();
      stopCommits();
      await store.close();
      stop();
      database.close();
    },
  };
}

export interface TestStore {
  readonly store: SeededStore;
  readonly directory: string;
  readonly layout: HubLayout;
  readonly close: () => Promise<void>;
}

export async function testStore(
  now: () => Date = () => new Date('2026-10-08T10:00:00.000Z'),
): Promise<TestStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-store-'));
  const layout = hubLayout(directory, {});
  const store = await openSeededStore({
    host: testStoreHost(),
    path: join(directory, 'test.db'),
    log: testLogger('store'),
    now,
    systemTimeZone: 'UTC',
    driveFolders: layout.drives,
  });
  await store.host.warm();
  await store.live.engineDefaults.load();
  OPEN_STORES.add(store);
  return {
    store,
    directory,
    layout,
    close: async (): Promise<void> => {
      OPEN_STORES.delete(store);
      await store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function closedStore(store: Store): Promise<void> {
  await store.close();
}
