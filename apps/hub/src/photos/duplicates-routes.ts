import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { photoActor } from './actor';
import type { DuplicatesService } from './duplicates';

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
): PhotoDuplicateRoutes {
  return {
    listPhotoDuplicates: bound(E.listPhotoDuplicates, async ({ query, caller }) => {
      const page = await duplicates.groups(photoActor(caller), { media: true }, query.cursor);
      return { items: page.groups, next: page.next };
    }),
    readPhotoDuplicateStats: bound(E.readPhotoDuplicateStats, ({ caller }) =>
      duplicates.stats(photoActor(caller), { media: true }),
    ),
    keepBestDuplicates: bound(E.keepBestDuplicates, ({ body, caller }) =>
      duplicates.keepBest(photoActor(caller), body),
    ),
    markNotDuplicates: bound(E.markNotDuplicates, async ({ body, caller }) => {
      await duplicates.markNotDuplicates(photoActor(caller), body.sha256s);
      return { ok: true } as const;
    }),
    listStacks: bound(E.listStacks, ({ query, caller }) =>
      store.host.read('photoStacks', { actor: photoActor(caller), cursor: query.cursor }),
    ),
    readStack: bound(E.readStack, ({ params, caller }) =>
      store.host.read('photoStack', { actor: photoActor(caller), stackId: params.stackId }),
    ),
    makeStackCover: bound(E.makeStackCover, ({ params, body, caller }) =>
      store.host.write('photoStackCover', {
        actor: photoActor(caller),
        stackId: params.stackId,
        itemId: body.itemId,
      }),
    ),
  };
}
