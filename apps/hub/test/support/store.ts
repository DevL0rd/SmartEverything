import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hubLayout, type HubLayout } from '../../src/data-layout';
import { openStore, type Store } from '../../src/store/store';
import { testLogger } from './logs';
import { testStoreHost } from './store-host';

export const OPEN_STORES = new Set<Store>();

export interface TestStore {
  readonly store: Store;
  readonly directory: string;
  readonly layout: HubLayout;
  readonly close: () => Promise<void>;
}

export async function testStore(
  now: () => Date = () => new Date('2026-10-08T10:00:00.000Z'),
): Promise<TestStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-store-'));
  const layout = hubLayout(directory, {});
  const store = openStore({
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
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
