import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../../apps/hub/src/data-layout/index.ts';
import { assembledStore } from '../../apps/hub/src/store/assemble.ts';
import type { HostStore } from '../../apps/hub/src/store/host/host-store.ts';
import { durableSessionWrite } from '../../apps/hub/src/store/repositories/dsh-session-durability.ts';
import { Sql } from '../../apps/hub/src/store/sql.ts';
import { openStore, STORE_BUSY_TIMEOUT_MS, type Store } from '../../apps/hub/src/store/store.ts';
import type { ScratchPaths } from './guard.ts';
import { SERVICE_BUILD } from './hub.ts';
import { layoutOf } from './layout.ts';

export type Seeded = Store & Omit<HostStore, 'path' | 'feed' | 'reader' | 'now' | 'close'>;

export interface SeedStore {
  readonly store: Seeded;
  readonly layout: HubLayout;
  readonly close: () => Promise<void>;
}

export async function openSeedStore(paths: ScratchPaths): Promise<SeedStore> {
  const layout = layoutOf(paths);
  await mkdir(dirname(layout.system.database.file), { recursive: true, mode: 0o700 });
  Logger.configure({ level: 'error' });
  const store = await openStore({
    path: layout.system.database.file,
    log: new Logger('tool.test-hub'),
    now: () => new Date(),
    systemTimeZone: 'UTC',
    driveFolders: layout.drives,
    host: { script: join(SERVICE_BUILD, 'store-host.mjs'), readers: 1 },
  });
  await store.host.warm();
  const database = new DatabaseSync(layout.system.database.file, {
    enableForeignKeyConstraints: true,
  });
  database.exec(`pragma busy_timeout = ${String(STORE_BUSY_TIMEOUT_MS)}`);
  const sql = new Sql(database);
  const seeding = assembledStore(sql, store.feed, {
    log: new Logger('tool.test-hub'),
    now: () => new Date(),
    driveFolders: layout.drives,
  });
  const stopCommits = sql.onCommit(() => {
    store.host.committedOnMain();
  });
  const stopForeign = store.feed.subscribeCommitted(() => {
    seeding.context.foreignCommitted();
  });
  return {
    store: {
      ...seeding.repositories,
      ...store,
      context: seeding.context,
      database,
      settings: seeding.settings,
      ledger: seeding.ledger,
      write: (work) => seeding.context.write(work),
      durableWrite: (work) => durableSessionWrite(seeding.context, work),
    },
    layout,
    close: async (): Promise<void> => {
      stopForeign();
      stopCommits();
      await store.live.access.settled();
      await store.close();
      database.close();
    },
  };
}
