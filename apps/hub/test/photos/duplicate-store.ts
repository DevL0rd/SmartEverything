import { DuplicateQueries } from '../../src/photos/duplicate-queries';
import type { DuplicateStore } from '../../src/photos/duplicates';
import type { StoreContext } from '../../src/store/context';

function later<T>(work: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(work());
  });
}

export function contextDuplicates(context: StoreContext): DuplicateStore {
  const queries = new DuplicateQueries(context);
  return {
    groups: (actor, scope, cursor) => later(() => queries.groups(actor, scope, cursor)),
    stats: (actor, scope) => later(() => queries.stats(actor, scope)),
    keepPlan: (actor, request) => later(() => queries.keepPlan(actor, request)),
    mergeAlbums: (actor, keeperId, loserIds) =>
      later(() => {
        queries.mergeAlbums(actor, keeperId, loserIds);
      }),
    hide: (actor, sha256s) =>
      later(() => {
        queries.markNotDuplicates(actor, sha256s);
      }),
  };
}
