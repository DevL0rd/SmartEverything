import { join } from 'node:path';
import type { HubDatabase } from '../../src/database/port';
import { storeDatabase } from '../../src/store/hub-database';
import type { Store } from '../../src/store/store';
import { testStore } from './store';

type FailableOperation = 'insertEvents' | 'finishCommand';

export interface TestDatabase {
  readonly store: Store;
  readonly database: HubDatabase;
  readonly recordings: string;
  readonly failNext: (operation: FailableOperation) => void;
  readonly setNow: (now: Date) => void;
  readonly close: () => Promise<void>;
}

export async function testDatabase(
  start = new Date('2026-10-08T10:00:00.000Z'),
): Promise<TestDatabase> {
  let now = start;
  let failing: FailableOperation | null = null;
  const { store, directory, close } = await testStore(() => now);
  const recordings = join(directory, 'recordings');
  const real = storeDatabase(store, (storagePath) => join(recordings, storagePath));
  const guard =
    <Args extends readonly unknown[], Result>(
      operation: FailableOperation,
      work: (...args: Args) => Promise<Result>,
    ) =>
    (...args: Args): Promise<Result> => {
      if (failing !== operation) return work(...args);
      failing = null;
      return Promise.reject(new Error(`${operation} failed on purpose`));
    };
  return {
    store,
    recordings,
    database: {
      ...real,
      insertEvents: guard('insertEvents', real.insertEvents),
      finishCommand: guard('finishCommand', real.finishCommand),
    },
    failNext: (operation): void => {
      failing = operation;
    },
    setNow: (next): void => {
      now = next;
    },
    close,
  };
}
