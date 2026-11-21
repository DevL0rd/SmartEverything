import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKER_ONLY_MODULES,
  mainThreadDatabases,
  mainThreadStoreUses,
  readMainThreadStore,
  sortedUses,
  workerModuleImporters,
} from './main-thread-store';
import { repositoryRoot } from './repository-files';

describe('the Hub store off the main thread', () => {
  const listed = readMainThreadStore();

  it('names only hosted files that exist', () => {
    expect(listed.hosted.filter((path) => !existsSync(join(repositoryRoot, path)))).toEqual([]);
  });

  it('has no synchronous store call left on the main thread', () => {
    expect(listed.remaining).toEqual({});
    expect(mainThreadStoreUses(new Set(listed.hosted))).toEqual(sortedUses(listed.remaining));
  });

  it('opens no SQLite connection on the Hub main thread', () => {
    expect(mainThreadDatabases()).toEqual([]);
  });

  it('loads the worker-only database modules only from their worker threads', () => {
    expect(workerModuleImporters()).toEqual(
      Object.fromEntries(
        Object.entries(WORKER_ONLY_MODULES).map(([module, workers]) => [module, [...workers]]),
      ),
    );
  });
});
