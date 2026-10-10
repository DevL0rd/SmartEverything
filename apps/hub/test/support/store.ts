import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type Store } from '../../src/store/store';
import { testLogger } from './logs';

export interface TestStore {
  readonly store: Store;
  readonly directory: string;
  readonly close: () => Promise<void>;
}

export async function testStore(
  now: () => Date = () => new Date('2026-10-08T10:00:00.000Z'),
): Promise<TestStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-store-'));
  const store = openStore({
    path: join(directory, 'test.db'),
    log: testLogger('store'),
    now,
    systemTimeZone: 'UTC',
  });
  return {
    store,
    directory,
    close: async (): Promise<void> => {
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
