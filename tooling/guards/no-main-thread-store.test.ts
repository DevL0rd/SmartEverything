import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mainThreadStoreUses, readMainThreadStore, sortedUses } from './main-thread-store';
import { repositoryRoot } from './repository-files';

describe('the Hub store off the main thread', () => {
  const listed = readMainThreadStore();

  it('names only hosted files that exist', () => {
    expect(listed.hosted.filter((path) => !existsSync(join(repositoryRoot, path)))).toEqual([]);
  });

  it('never gains a synchronous store call on the main thread, and the list only shrinks', () => {
    expect(mainThreadStoreUses(new Set(listed.hosted))).toEqual(sortedUses(listed.remaining));
  });
});
