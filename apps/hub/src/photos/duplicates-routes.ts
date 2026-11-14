import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';
import type { DuplicatesService } from './duplicates';
import type { StacksService } from './stacks';

const E = PHOTOS_ENDPOINTS;

export interface PhotoDuplicateRoutes {
  readonly listPhotoDuplicates: Bound<typeof E.listPhotoDuplicates>;
  readonly readPhotoDuplicateStats: Bound<typeof E.readPhotoDuplicateStats>;
  readonly keepBestDuplicates: Bound<typeof E.keepBestDuplicates>;
  readonly markNotDuplicates: Bound<typeof E.markNotDuplicates>;
  readonly listStacks: Bound<typeof E.listStacks>;
  readonly readStack: Bound<typeof E.readStack>;
  readonly makeStackCover: Bound<typeof E.makeStackCover>;
}

export function photoDuplicateRoutes(
  store: Store,
  duplicates: DuplicatesService,
  stacks: StacksService,
): PhotoDuplicateRoutes {
  return {
    listPhotoDuplicates: bound(E.listPhotoDuplicates, ({ query, caller }) => {
      const page = duplicates.groups(photoActor(store, caller), { media: true }, query.cursor);
      return { items: page.groups, next: page.next };
    }),
    readPhotoDuplicateStats: bound(E.readPhotoDuplicateStats, ({ caller }) =>
      duplicates.stats(photoActor(store, caller), { media: true }),
    ),
    keepBestDuplicates: bound(E.keepBestDuplicates, ({ body, caller }) =>
      duplicates.keepBest(photoActor(store, caller), body),
    ),
    markNotDuplicates: bound(E.markNotDuplicates, ({ body, caller }) => {
      duplicates.markNotDuplicates(photoActor(store, caller), body.sha256s);
      return { ok: true } as const;
    }),
    listStacks: bound(E.listStacks, ({ query, caller }) =>
      stacks.list(photoActor(store, caller), query.cursor),
    ),
    readStack: bound(E.readStack, ({ params, caller }) =>
      stacks.read(photoActor(store, caller), params.stackId),
    ),
    makeStackCover: bound(E.makeStackCover, ({ params, body, caller }) =>
      stacks.makeCover(photoActor(store, caller), params.stackId, body.itemId),
    ),
  };
}
